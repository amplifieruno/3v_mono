import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { HasuraClient } from '../hasura/client.js';
import { cropFace } from '../face/crop.js';
import { vectorLiteral, type AcceptedPhoto } from '../face/enrollmentSteps.js';
import type { ExtractedFace, InsightFaceClient } from '../face/insightFaceClient.js';
import { MIN_QUALITY, qualityScore } from '../face/quality.js';
import type { StorageClient } from '../storage/storageClient.js';
import type { DetectionBox, DetectionMessage, FrameResult, RecognitionDevice } from './types.js';

/** Faces handled per frame (highest detector score first); the rest of a crowded frame is ignored. */
export const MAX_FACES_PER_FRAME = 5;

export type FrameDeps = {
  /** Admin secret + the device organization's session (role admin, x-hasura-organization-id). */
  org: HasuraClient;
  storage: StorageClient;
  insightFace: InsightFaceClient;
  /** Enrollment camera path (face/cameraIdentity.ts) bound to the device organization. */
  createIdentity(
    capture: AcceptedPhoto,
    options: { deviceId: string; capturedAt: Date },
  ): Promise<{ id: string; code: string; cropFileId: string | null }>;
  /** Runs `task` under the device organization's identity lock (shared by all sessions of the organization). */
  withIdentityLock<T>(task: () => Promise<T>): Promise<T>;
  modelVersion: string;
  log(message: string): void;
};

const MATCH = `
  query RecognitionMatch($embedding: String!) {
    match_face(args: { p_embedding: $embedding, p_limit: 1 }) { identity_id profile_id similarity }
  }
`;
const SUPPRESSED = `
  query RecognitionSuppressed($embedding: String!) {
    match_face_suppressed(args: { p_embedding: $embedding }) { similarity }
  }
`;
const IDENTITY = `
  query RecognitionIdentity($id: uuid!) {
    identities_by_pk(id: $id) {
      code profile_id profile { first_name last_name }
      identity_embeddings_aggregate(where: { is_template: { _eq: true } }) {
        aggregate { count min { quality_score } }
      }
    }
  }
`;
const INSERT_DETECTION = `
  mutation RecognitionInsertDetection($object: detections_insert_input!) { insert_detections_one(object: $object) { id } }
`;
const CONSIDER_TEMPLATE = `
  mutation RecognitionConsiderTemplate($args: consider_template_args!) { consider_template(args: $args) { id } }
`;

type IdentityInfo = {
  code: string;
  profile_id: string | null;
  profile: { first_name: string; last_name: string } | null;
  identity_embeddings_aggregate: { aggregate: { count: number; min: { quality_score: number | null } } };
};

/** One face of the frame after matching / identity creation, before its detection row is written. */
type Resolved = {
  face: ExtractedFace;
  quality: number;
  identityId: string | null;
  identityCode: string | null;
  profileId: string | null;
  profileName: string | null;
  similarity: number | null;
  isNew: boolean;
  thumbnailFileId: string | null;
  templates: { count: number; worst: number | null } | null;
};

const toBox = ([x1, y1, x2, y2]: ExtractedFace['bbox']): DetectionBox => ({ x: x1, y: y1, width: x2 - x1, height: y2 - y1 });

type FaceMatch = { identity_id: string; profile_id: string | null; similarity: number };

async function matchFace(deps: FrameDeps, capture: AcceptedPhoto): Promise<FaceMatch | undefined> {
  const { match_face: matches } = await deps.org.request<{ match_face: FaceMatch[] }>(MATCH, {
    embedding: vectorLiteral(capture.face.embedding),
  });
  return matches[0];
}

/**
 * Best similarity among identities whose processing is restricted or whose biometric consent was withdrawn
 * (itap.match_face_suppressed, same threshold as match_face), if any.
 */
async function suppressedSimilarity(deps: FrameDeps, capture: AcceptedPhoto): Promise<number | undefined> {
  const { match_face_suppressed: rows } = await deps.org.request<{ match_face_suppressed: { similarity: number }[] }>(SUPPRESSED, {
    embedding: vectorLiteral(capture.face.embedding),
  });
  return rows[0]?.similarity;
}

async function known(deps: FrameDeps, capture: AcceptedPhoto, match: FaceMatch): Promise<Resolved> {
  const { identities_by_pk: info } = await deps.org.request<{ identities_by_pk: IdentityInfo | null }>(IDENTITY, {
    id: match.identity_id,
  });
  const aggregate = info?.identity_embeddings_aggregate.aggregate;
  return {
    face: capture.face,
    quality: capture.quality,
    identityId: match.identity_id,
    identityCode: info?.code ?? null,
    profileId: info?.profile_id ?? match.profile_id,
    profileName: info?.profile ? `${info.profile.first_name} ${info.profile.last_name}`.trim() : null,
    similarity: match.similarity,
    isNew: false,
    thumbnailFileId: null,
    templates: aggregate ? { count: aggregate.count, worst: aggregate.min.quality_score } : null,
  };
}

/**
 * Match, else (good enough faces) create a camera identity. Creation runs under the organization's identity lock
 * and re-matches first, so two cameras of one organization seeing the same new person create one identity.
 * Returns null for the face of a person whose processing is restricted or who withdrew biometric consent (a
 * suppressed identity at least as similar as the best match): it is dropped, no detection and no new identity.
 */
async function resolveFace(
  deps: FrameDeps,
  device: RecognitionDevice,
  capture: AcceptedPhoto,
  capturedAt: Date,
): Promise<Resolved | null> {
  const match = await matchFace(deps, capture);
  const suppressed = await suppressedSimilarity(deps, capture);
  if (suppressed !== undefined && (!match || suppressed >= match.similarity)) return null;
  if (match) return known(deps, capture, match);
  const unidentified = {
    face: capture.face,
    quality: capture.quality,
    identityId: null,
    identityCode: null,
    profileId: null,
    profileName: null,
    similarity: null,
    templates: null,
  };
  if (capture.quality < MIN_QUALITY) {
    // Too small/blurry to start a reliable identity: the detection is kept without one.
    return { ...unidentified, isNew: false, thumbnailFileId: null };
  }
  return deps.withIdentityLock(async () => {
    const rematch = await matchFace(deps, capture);
    if (rematch) return known(deps, capture, rematch);
    const created = await deps.createIdentity(capture, { deviceId: device.id, capturedAt });
    return { ...unidentified, identityId: created.id, identityCode: created.code, isNew: true, thumbnailFileId: created.cropFileId };
  });
}

/** Quality a capture must gain over the worst of five templates (same rule as itap.consider_template). */
export const TEMPLATE_MARGIN = 0.05;

/** Whether a capture may become a template: good enough and clearly better than the worst of the top five. */
const beatsTemplates = (r: Resolved): boolean =>
  r.templates !== null &&
  r.quality >= MIN_QUALITY &&
  (r.templates.count < 5 || r.quality > (r.templates.worst ?? 0) + TEMPLATE_MARGIN);

/**
 * Template rule (spec §7) for a recognised identity: the crop is stored only when the pre-check says the capture
 * beats the worst template; itap.consider_template re-checks atomically and records photo + embedding, else the
 * crop is removed again.
 */
async function considerTemplate(
  deps: FrameDeps,
  device: RecognitionDevice,
  capture: AcceptedPhoto,
  resolved: Resolved,
  detectionId: string,
  capturedAt: Date,
): Promise<void> {
  if (!resolved.identityId || !beatsTemplates(resolved)) return;
  const crop = await cropFace(capture.image, capture.face.bbox);
  const { id: fileId } = await deps.storage.upload({
    bucketId: device.organizationId,
    name: `identity-photo-${randomUUID()}.jpg`,
    mimeType: 'image/jpeg',
    data: crop,
    metadata: { kind: 'identity_photo', identity_id: resolved.identityId, device_id: device.id },
  });
  try {
    const { consider_template: added } = await deps.org.request<{ consider_template: { id: string }[] }>(CONSIDER_TEMPLATE, {
      args: {
        p_organization_id: device.organizationId,
        p_identity_id: resolved.identityId,
        p_embedding: vectorLiteral(capture.face.embedding),
        p_quality: resolved.quality,
        p_model_version: deps.modelVersion,
        p_photo_file_id: fileId,
        p_device_id: device.id,
        p_captured_at: capturedAt.toISOString(),
        p_source_detection_id: detectionId,
      },
    });
    if (added.length === 0) await deps.storage.deleteFile(fileId);
  } catch (error: unknown) {
    await deps.storage.deleteFile(fileId).catch(() => undefined);
    throw error;
  }
}

/** Identity order of detection inserts (hasura-conventions "Detection Pipeline"): by identity id, unidentified last. */
function byIdentity(a: { resolved: Resolved }, b: { resolved: Resolved }): number {
  const x = a.resolved.identityId;
  const y = b.resolved.identityId;
  if (x === y) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return x < y ? -1 : 1;
}

/**
 * Recognizes one camera frame: detect + embed (InsightFace), then per face (at most five) match within the device's
 * organization (match_face with the organization's recognition_threshold); faces of restricted / consent-withdrawn
 * people are dropped (counted in `suppressed`); an unmatched face of sufficient quality
 * becomes a camera identity (its crop is the detection thumbnail). Detection rows are inserted one per statement,
 * sorted by identity id (Stage A runs per row in the same transaction). Recognised identities then get the template
 * rule; its failure never loses the detection. An aborted `signal` (session stopped) stops matching further faces; the
 * faces already resolved still get their detections (an identity just created is never left without one).
 */
export async function processFrame(
  deps: FrameDeps,
  device: RecognitionDevice,
  frame: Buffer,
  capturedAt: Date,
  signal?: AbortSignal,
): Promise<FrameResult> {
  const { width = 0, height = 0 } = await sharp(frame).metadata();
  if (!width || !height) throw new Error('Snapshot is not a decodable image');
  const faces = await deps.insightFace.extract(frame);
  const selected = [...faces].sort((a, b) => b.score - a.score).slice(0, MAX_FACES_PER_FRAME);

  const items: { capture: AcceptedPhoto; resolved: Resolved }[] = [];
  let suppressed = 0;
  for (const [index, face] of selected.entries()) {
    if (signal?.aborted) break;
    const capture: AcceptedPhoto = {
      index,
      source: { ref: `${device.id}#${index}`, load: async () => frame },
      image: frame,
      face,
      quality: qualityScore(face, width, height),
      match: null,
    };
    const resolved = await resolveFace(deps, device, capture, capturedAt);
    if (resolved) items.push({ capture, resolved });
    else suppressed += 1;
  }

  const detections: DetectionMessage[] = [];
  const written: { capture: AcceptedPhoto; resolved: Resolved; detectionId: string }[] = [];
  const detectedAt = capturedAt.toISOString();
  for (const { capture, resolved } of items.sort(byIdentity)) {
    const bbox = toBox(resolved.face.bbox);
    const { insert_detections_one: row } = await deps.org.request<{ insert_detections_one: { id: string } }>(
      INSERT_DETECTION,
      {
        object: {
          organization_id: device.organizationId,
          device_id: device.id,
          identity_id: resolved.identityId,
          confidence: resolved.face.score,
          similarity: resolved.similarity,
          is_new_identity: resolved.isNew,
          bbox,
          frame_width: width,
          frame_height: height,
          quality_score: resolved.quality,
          thumbnail_file_id: resolved.thumbnailFileId,
          detected_at: detectedAt,
        },
      },
    );
    detections.push({
      detectionId: row.id,
      deviceId: device.id,
      identityId: resolved.identityId,
      identityCode: resolved.identityCode,
      profileId: resolved.profileId,
      profileName: resolved.profileName,
      isNewIdentity: resolved.isNew,
      confidence: resolved.face.score,
      bbox,
      frameWidth: width,
      frameHeight: height,
      detectedAt,
    });
    written.push({ capture, resolved, detectionId: row.id });
  }
  for (const { capture, resolved, detectionId } of written) {
    try {
      await considerTemplate(deps, device, capture, resolved, detectionId, capturedAt);
    } catch (error: unknown) {
      deps.log(`recognition ${device.id}: template update failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { faces: faces.length, suppressed, detections };
}
