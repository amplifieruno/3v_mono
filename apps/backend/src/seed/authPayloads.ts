import { STATIC_MAX_HAMMING, STATIC_MIN_SIMILARITY } from '../auth-service/liveness.js';
import { DEFAULT_MODEL_VERSION } from '../face/enrollmentService.js';
import type { AttackPlan, QualityReason } from './authScenarios.js';
import type { Random } from './random.js';

/**
 * p_quality / p_attack of a seeded capture, shaped like the ones the live pipeline sends (auth-service/pipeline.ts):
 * per-frame summary of a 3-frame sequence, model version, pipeline time; sequence check outcome with its details,
 * binding result, request id and the sequence digest (sha256 hex; a replay reuses an earlier one).
 */
const round = (x: number, digits = 3): number => Number(x.toFixed(digits));

export function hexDigest(rng: Random): string {
  let out = '';
  for (let i = 0; i < 64; i += 1) out += '0123456789abcdef'[rng.int(0, 15)];
  return out;
}

export function requestId(rng: Random): string {
  const h = hexDigest(rng);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function qualityPayload(rng: Random, reason: QualityReason | null): Record<string, unknown> {
  const failing = reason ? rng.int(0, 2) : -1;
  const frames = [0, 1, 2].map((index) => {
    const bad = index === failing ? reason : null;
    return {
      index,
      faces: bad === 'no_face' ? 0 : bad === 'multiple_faces' ? 2 : 1,
      reason: bad,
      quality: bad === 'no_face' ? null : round(bad === 'low_quality' ? 0.18 + rng.next() * 0.1 : 0.55 + rng.next() * 0.35),
      brightness: round(bad === 'poor_lighting' ? 12 + rng.next() * 14 : 95 + rng.next() * 70, 1),
      sharpness: round(bad === 'blur' ? 18 + rng.next() * 18 : 140 + rng.next() * 600, 1),
    };
  });
  const faceMs = rng.int(150, 260);
  return {
    ...(reason ? { failure_reason: reason } : {}),
    model_version: DEFAULT_MODEL_VERSION,
    pipeline_ms: faceMs + rng.int(40, 90),
    frames,
    timings: { normalize_ms: rng.int(4, 12), face_service_ms: faceMs, analysis_ms: rng.int(8, 25), evidence_ms: rng.int(18, 40) },
  };
}

export function attackPayload(rng: Random, plan: AttackPlan, digest: string): Record<string, unknown> {
  const thresholds = { static_max_hamming: STATIC_MAX_HAMMING, static_min_similarity: STATIC_MIN_SIMILARITY };
  const request = { request_id: requestId(rng) };
  const moving = { max_hamming: rng.int(4, 14), min_similarity: round(0.83 + rng.next() * 0.14, 4), thresholds, binding: 'valid' };
  switch (plan) {
    case 'passed':
    case 'replay':
      // A replay carries a valid-looking check of the replayed frames; the engine flags the reused digest.
      return { outcome: 'passed', details: { ...moving, ...request }, sequence_digest: digest };
    case 'printed_photo':
      return {
        outcome: 'printed_photo',
        details: { reason: 'no_inter_frame_change', max_hamming: rng.int(0, 2), min_similarity: round(0.986 + rng.next() * 0.01, 4), thresholds, binding: 'valid', ...request },
        sequence_digest: digest,
      };
    case 'injection':
      return { outcome: 'injection', details: { reason: 'binding_mismatch', binding: 'mismatch', ...request }, sequence_digest: digest };
    case 'not_checked':
      return { outcome: 'not_checked', details: { reason: 'quality_failure', binding: 'valid', ...request }, sequence_digest: digest };
    case 'liveness_unavailable':
      // Frames usable for matching but the sequence checks could not run (e.g. a capture SDK sending one repeated pose).
      return { outcome: 'not_checked', details: { reason: 'sequence_checks_unavailable', binding: 'valid', ...request }, sequence_digest: digest };
  }
}
