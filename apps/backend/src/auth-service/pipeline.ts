import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { cropFace } from '../face/crop.js';
import { DEFAULT_MODEL_VERSION } from '../face/enrollmentService.js';
import { normalizeImage, vectorLiteral } from '../face/enrollmentSteps.js';
import type { InsightFaceBatchClient } from '../face/insightFaceClient.js';
import type { StorageClient } from '../storage/storageClient.js';
import { analyzeFrame, bestFrame, meanEmbedding, sequenceReason, type FrameAnalysis } from './analysis.js';
import { ServiceError, serviceErrorFromSql } from './errors.js';
import { hasDuplicateFrames, type Sequence } from './frames.js';
import { sequenceAttack, type AttackCheck } from './liveness.js';
import type { AuthStore, PublicDecision, SessionRow } from './store.js';

export type PipelineDeps = {
  store: AuthStore;
  storage: StorageClient;
  insightFace: InsightFaceBatchClient;
  modelVersion?: string;
};

/** How the sequence is bound to its session: verified by the REST service, not applicable to the console action. */
export type Binding = { kind: 'verified'; valid: boolean } | { kind: 'console' };

export type PipelineInput = {
  organizationId: string;
  applicationId: string;
  session: SessionRow;
  /** Canonical claimed identity (verification), as bound to the session by hash. */
  claimedIdentityId: string | null;
  sequence: Sequence;
  binding: Binding;
  requestThreshold: number | null;
  /** Epoch ms after which no decision is started (the request timeout). */
  deadline: number;
  startedAt: number;
};

export const timeoutError = () =>
  new ServiceError(504, 'timeout', 'The request did not complete within its timeout', true, 'Retry the capture.');

function beforeDeadline<T>(work: Promise<T>, deadline: number): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return Promise.reject(timeoutError());
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(timeoutError()), remaining);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

async function analyzeSequence(deps: PipelineDeps, frames: Buffer[], deadline: number) {
  const normalizeStarted = Date.now();
  const normalized = await Promise.all(
    frames.map((frame, index) =>
      normalizeImage(frame).catch(() => {
        throw new ServiceError(400, 'invalid_sequence', `frames[${index}] is not a readable image`);
      }),
    ),
  );
  const normalizeMs = Date.now() - normalizeStarted;
  const faceStarted = Date.now();
  const faces = await beforeDeadline(deps.insightFace.extractMany(normalized.map((n) => n.image)), deadline).catch((error: unknown) => {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(503, 'face_service_unavailable', 'The face service is unavailable', true, 'Retry in a moment.');
  });
  const faceMs = Date.now() - faceStarted;
  const analysisStarted = Date.now();
  const analyses = await Promise.all(normalized.map((n, i) => analyzeFrame(i, n.image, n.width, n.height, faces[i])));
  const timings = { normalize_ms: normalizeMs, face_service_ms: faceMs, analysis_ms: Date.now() - analysisStarted };
  return { normalized, analyses, timings };
}

function attackOf(binding: Binding, analyses: FrameAnalysis[], frames: Buffer[], usable: boolean): AttackCheck {
  const bindingDetail = binding.kind === 'console' ? { binding: 'not_applicable_console' } : { binding: binding.valid ? 'valid' : 'mismatch' };
  if (binding.kind === 'verified' && !binding.valid) {
    return { outcome: 'injection', details: { reason: 'binding_mismatch', ...bindingDetail } };
  }
  if (!usable) {
    // Liveness is never reported passed without the sequence checks (they need a usable face in every frame).
    if (hasDuplicateFrames(frames)) return { outcome: 'injection', details: { reason: 'duplicate_frames', ...bindingDetail } };
    return { outcome: 'not_checked', details: { reason: 'quality_failure', ...bindingDetail } };
  }
  const check = sequenceAttack(analyses, frames);
  return { outcome: check.outcome, details: { ...check.details, ...bindingDetail } };
}

/** Evidence frame for a non-success outcome: the best face crop, else the first frame scaled down (kind auth_capture). */
async function uploadEvidence(
  deps: PipelineDeps,
  organizationId: string,
  sessionId: string,
  normalized: { image: Buffer }[],
  analyses: FrameAnalysis[],
): Promise<string | null> {
  const best = bestFrame(analyses);
  const image = best?.bbox
    ? await cropFace(normalized[best.index].image, best.bbox, 224)
    : await sharp(normalized[0].image).resize(320, 320, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer();
  const { id } = await deps.storage.upload({
    bucketId: organizationId,
    name: `auth-evidence-${randomUUID()}.jpg`,
    mimeType: 'image/jpeg',
    data: image,
    metadata: { kind: 'auth_capture', session_id: sessionId, frame_index: best?.index ?? 0 },
  });
  return id;
}

const frameSummary = (a: FrameAnalysis) => ({
  index: a.index,
  faces: a.faces,
  reason: a.reason ?? null,
  quality: a.quality ?? null,
  brightness: a.brightness ?? null,
  sharpness: a.sharpness ?? null,
});

/**
 * One authentication step (initial or recapture) of a session: per-frame quality, sequence attack checks, session
 * binding, probe embedding (mean of the frames), evidence upload, then the SQL decision at the database's now()
 * (itap.auth_service_decide, recorded). Evidence is kept only for non-success outcomes (deleted after a success).
 */
export async function runAuthentication(deps: PipelineDeps, input: PipelineInput): Promise<PublicDecision> {
  const { frames, digest } = input.sequence;
  const { normalized, analyses, timings } = await analyzeSequence(deps, frames, input.deadline);
  const reason = sequenceReason(analyses);
  const attack = attackOf(input.binding, analyses, frames, reason === undefined);
  const embedding = reason === undefined ? vectorLiteral(meanEmbedding(analyses)) : null;

  if (Date.now() >= input.deadline) throw timeoutError();
  const evidenceStarted = Date.now();
  const evidence = await uploadEvidence(deps, input.organizationId, input.session.id, normalized, analyses);
  const quality = {
    ...(reason ? { failure_reason: reason } : {}),
    model_version: deps.modelVersion ?? DEFAULT_MODEL_VERSION,
    pipeline_ms: Date.now() - input.startedAt,
    frames: analyses.map(frameSummary),
    timings: { ...timings, evidence_ms: Date.now() - evidenceStarted },
  };
  let decision: PublicDecision;
  try {
    if (Date.now() >= input.deadline) throw timeoutError();
    decision = await deps.store.decide({
      p_org: input.organizationId,
      p_app: input.applicationId,
      p_session: input.session.id,
      p_mode: input.session.mode,
      p_claimed_identity: input.claimedIdentityId,
      p_access_point: input.session.access_point_id,
      p_embedding: embedding,
      p_quality: quality,
      p_attack: { outcome: attack.outcome, details: attack.details, sequence_digest: digest.toString('hex') },
      p_request_threshold: input.requestThreshold,
      p_evidence_file: evidence,
    });
  } catch (error: unknown) {
    if (evidence) void deps.storage.deleteFile(evidence).catch(() => undefined);
    throw serviceErrorFromSql(error) ?? error;
  }
  if (decision.outcome === 'success' && evidence) {
    // Successes keep no image (SA_6 §2.1.7); the attempt row does not reference it.
    void deps.storage.deleteFile(evidence).catch(() => undefined);
  }
  return decision;
}
