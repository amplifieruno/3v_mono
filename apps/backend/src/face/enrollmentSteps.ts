import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { HasuraClient } from '../hasura/client.js';
import type { StorageClient } from '../storage/storageClient.js';
import { cropFace } from './crop.js';
import type { ExtractedFace, InsightFaceClient } from './insightFaceClient.js';
import { InvalidImageError, type PhotoSource } from './photoSources.js';
import { MIN_QUALITY, qualityScore } from './quality.js';

export type RejectReason = 'no_face' | 'multiple_faces' | 'low_quality' | 'invalid_image' | 'conflicting_identity';
export type Rejected = { index: number; ref: string; reason: RejectReason };
export type FaceMatch = { identity_id: string; profile_id: string | null; distance: number };

export type AcceptedPhoto = {
  index: number;
  source: PhotoSource;
  image: Buffer;
  face: ExtractedFace;
  quality: number;
  /** Nearest identity of the organization within the recognition threshold, if any. */
  match: FaceMatch | null;
};

const MATCH_FACE = `
  query EnrollmentMatch($embedding: String!) {
    match_face(args: { p_embedding: $embedding, p_limit: 1 }) { identity_id profile_id distance }
  }
`;

export function vectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

/** Applies EXIF orientation so InsightFace boxes and crops use the same pixel grid; returns the image size too. */
async function normalizeImage(raw: Buffer): Promise<{ image: Buffer; width: number; height: number }> {
  let meta: sharp.Metadata;
  try {
    meta = await sharp(raw).metadata();
  } catch {
    throw new InvalidImageError('Unreadable image');
  }
  if (!meta.width || !meta.height) throw new InvalidImageError('Image has no dimensions');
  if (!meta.orientation || meta.orientation === 1) return { image: raw, width: meta.width, height: meta.height };
  const { data, info } = await sharp(raw).rotate().jpeg({ quality: 95 }).toBuffer({ resolveWithObject: true });
  return { image: data, width: info.width, height: info.height };
}

/**
 * Detects, scores and matches each photo, strictly one at a time (one InsightFace call in flight per request).
 * `matcher` carries the caller's organization session, so `match_face` only sees that organization.
 */
export async function analyzePhotos(
  photos: PhotoSource[],
  insightFace: InsightFaceClient,
  matcher: HasuraClient,
): Promise<{ accepted: AcceptedPhoto[]; rejected: Rejected[] }> {
  const accepted: AcceptedPhoto[] = [];
  const rejected: Rejected[] = [];

  for (const [index, source] of photos.entries()) {
    const reject = (reason: RejectReason) => rejected.push({ index, ref: source.ref, reason });
    let normalized: Awaited<ReturnType<typeof normalizeImage>>;
    try {
      normalized = await normalizeImage(await source.load());
    } catch (error: unknown) {
      if (error instanceof InvalidImageError) {
        reject('invalid_image');
        continue;
      }
      throw error;
    }

    const faces = await insightFace.extract(normalized.image);
    if (faces.length === 0) {
      reject('no_face');
      continue;
    }
    if (faces.length > 1) {
      reject('multiple_faces');
      continue;
    }
    const [face] = faces;
    const quality = qualityScore(face, normalized.width, normalized.height);
    if (quality < MIN_QUALITY) {
      reject('low_quality');
      continue;
    }
    const { match_face: matches } = await matcher.request<{ match_face: FaceMatch[] }>(MATCH_FACE, {
      embedding: vectorLiteral(face.embedding),
    });
    accepted.push({ index, source, image: normalized.image, face, quality, match: matches[0] ?? null });
  }
  return { accepted, rejected };
}

export type CommitTarget = {
  identityId: string;
  /** Insert object for a new identity (id = identityId); absent when adding to an existing one. */
  newIdentity?: Record<string, unknown>;
};

export type CommitDeps = {
  actor: HasuraClient;
  storage: StorageClient;
  organizationId: string;
  modelVersion: string;
};

/**
 * Uploads a crop per accepted photo (`metadata.kind = 'identity_photo'`), then writes the identity (when new),
 * photos and embeddings in one GraphQL mutation (one transaction) through `actor`, so audit rows record the caller.
 * A failed write removes the uploaded crops.
 */
export async function commitPhotos(
  deps: CommitDeps,
  target: CommitTarget,
  kind: 'enrollment' | 'manual' | 'capture',
  photos: AcceptedPhoto[],
): Promise<void> {
  if (photos.length === 0 && !target.newIdentity) return;
  const { actor, storage, organizationId } = deps;
  const cropIds: string[] = [];
  try {
    for (const photo of photos) {
      const crop = await cropFace(photo.image, photo.face.bbox);
      const { id } = await storage.upload({
        bucketId: organizationId,
        name: `identity-photo-${randomUUID()}.jpg`,
        mimeType: 'image/jpeg',
        data: crop,
        metadata: {
          kind: 'identity_photo',
          identity_id: target.identityId,
          ...(photo.source.fileId ? { source_file_id: photo.source.fileId } : {}),
        },
      });
      cropIds.push(id);
    }

    const base = { organization_id: organizationId, identity_id: target.identityId };
    const photoRows = photos.map((p, i) => ({ ...base, file_id: cropIds[i], kind, quality_score: p.quality }));
    const embeddingRows = photos.map((p, i) => ({
      ...base,
      embedding: vectorLiteral(p.face.embedding),
      quality_score: p.quality,
      model_version: deps.modelVersion,
      photo_file_id: cropIds[i],
    }));
    const best = photos.reduce<{ quality: number; cropId: string | null }>(
      (acc, p, i) => (p.quality > acc.quality ? { quality: p.quality, cropId: cropIds[i] } : acc),
      { quality: -1, cropId: null },
    );

    // Root fields of one mutation run in order inside a single transaction.
    const fields = target.newIdentity
      ? ['insert_identities_one(object: $identity) { id }']
      : [
          `primary: update_identities(
             where: { id: { _eq: $identityId }, primary_photo_file_id: { _is_null: true } },
             _set: { primary_photo_file_id: $primaryPhoto }
           ) { affected_rows }`,
        ];
    fields.push('insert_identity_photos(objects: $photos) { affected_rows }');
    fields.push('insert_identity_embeddings(objects: $embeddings) { affected_rows }');
    const params = target.newIdentity
      ? '$identity: identities_insert_input!'
      : '$identityId: uuid!, $primaryPhoto: uuid';
    await actor.request(
      `mutation EnrollmentCommit(${params}, $photos: [identity_photos_insert_input!]!,
         $embeddings: [identity_embeddings_insert_input!]!) { ${fields.join('\n')} }`,
      {
        ...(target.newIdentity
          ? { identity: { ...target.newIdentity, id: target.identityId, primary_photo_file_id: best.cropId } }
          : { identityId: target.identityId, primaryPhoto: best.cropId }),
        photos: photoRows,
        embeddings: embeddingRows,
      },
    );
  } catch (error: unknown) {
    await Promise.all(cropIds.map((id) => storage.deleteFile(id).catch(() => undefined)));
    throw error;
  }
}
