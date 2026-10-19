import { createCameraIdentity } from '../face/cameraIdentity.js';
import type { EnrollmentDeps } from '../face/enrollmentService.js';
import { analyzePhotos } from '../face/enrollmentSteps.js';
import type { PhotoSource } from '../face/photoSources.js';

/**
 * Review-queue seed helpers: camera identities (as the detection pipeline would create them), duplicate candidates,
 * a merge and verification requests. Every helper is idempotent.
 */

const FIND_BY_REF = `
  query SeedIdentityByRef($org: uuid!, $ref: jsonb!) {
    identities(where: { organization_id: { _eq: $org }, attributes: { _contains: $ref } }) { id status }
  }
`;

/** Unlinked identity with source `camera`, keyed by `attributes.seed_ref`; returns its id and status. */
export async function cameraIdentity(
  deps: EnrollmentDeps,
  seedRef: string,
  photos: PhotoSource[],
): Promise<{ id: string; status: string }> {
  const ref = { seed_ref: seedRef };
  const found = await deps.clients.admin.request<{ identities: { id: string; status: string }[] }>(FIND_BY_REF, {
    org: deps.organizationId,
    ref,
  });
  if (found.identities[0]) return found.identities[0];
  // No duplicate check: a camera track of a known face is exactly what the duplicate-candidate queue reviews.
  const { accepted, rejected } = await analyzePhotos(photos, deps.insightFace, deps.clients.actor);
  if (accepted.length === 0) throw new Error(`seed: no usable face for ${seedRef} (${rejected.map((r) => r.reason).join(', ')})`);
  const { id } = await createCameraIdentity(deps, accepted, { attributes: ref });
  return { id, status: 'unverified' };
}

const TEMPLATES = `
  query SeedTemplates($ids: [uuid!]!) {
    identity_embeddings(where: { identity_id: { _in: $ids }, is_template: { _eq: true } }) { identity_id embedding }
  }
`;
const CANDIDATE = `
  query SeedCandidate($org: uuid!, $a: uuid!, $b: uuid!) {
    identity_duplicate_candidates(
      where: { organization_id: { _eq: $org }, identity_a_id: { _eq: $a }, identity_b_id: { _eq: $b } }
    ) { id }
  }
`;
const INSERT_CANDIDATE = `
  mutation SeedInsertCandidate($object: identity_duplicate_candidates_insert_input!) {
    insert_identity_duplicate_candidates_one(object: $object) { id }
  }
`;

function parseVector(literal: string): number[] {
  return literal.replace(/[[\]\s]/g, '').split(',').map(Number);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na * nb) || 1);
}

/** Open duplicate candidate for two identities (similarity of their closest templates), unless the pair exists. */
export async function duplicateCandidate(deps: EnrollmentDeps, first: string, second: string, detectedAt: Date): Promise<void> {
  const [a, b] = first < second ? [first, second] : [second, first];
  const { identity_duplicate_candidates: existing } = await deps.clients.admin.request<{
    identity_duplicate_candidates: { id: string }[];
  }>(CANDIDATE, { org: deps.organizationId, a, b });
  if (existing.length > 0) return;
  const { identity_embeddings: rows } = await deps.clients.admin.request<{
    identity_embeddings: { identity_id: string; embedding: string }[];
  }>(TEMPLATES, { ids: [a, b] });
  const ofA = rows.filter((r) => r.identity_id === a).map((r) => parseVector(r.embedding));
  const ofB = rows.filter((r) => r.identity_id === b).map((r) => parseVector(r.embedding));
  const similarity = Math.max(...ofA.flatMap((x) => ofB.map((y) => cosineSimilarity(x, y))));
  if (!Number.isFinite(similarity)) throw new Error(`seed: no templates for candidate pair ${a} / ${b}`);
  await deps.clients.actor.request(INSERT_CANDIDATE, {
    object: {
      organization_id: deps.organizationId,
      identity_a_id: a,
      identity_b_id: b,
      similarity: Math.round(similarity * 1000) / 1000,
      detected_at: detectedAt.toISOString(),
    },
  });
}

const MERGE = `
  mutation SeedMerge($target: uuid!, $sources: _uuid!, $reason: String) {
    merge_identities(args: { p_target: $target, p_sources: $sources, p_reason: $reason }) { id }
  }
`;

/** Merges `source` into `target` (closes their open candidate) unless the source is already merged. */
export async function mergeOnce(deps: EnrollmentDeps, target: string, source: { id: string; status: string }, reason: string): Promise<void> {
  if (source.status === 'merged') return;
  await deps.clients.actor.request(MERGE, { target, sources: `{${source.id}}`, reason });
}

const REQUESTS = `
  query SeedVerificationRequests($id: uuid!) { verification_requests(where: { identity_id: { _eq: $id } }) { id } }
`;
const INSERT_REQUEST = `
  mutation SeedInsertRequest($object: verification_requests_insert_input!) {
    insert_verification_requests_one(object: $object) { id }
  }
`;
const APPROVE = `
  mutation SeedApprove($id: uuid!, $reason: String) { approve_verification(args: { p_request: $id, p_reason: $reason }) { id } }
`;

/** A verification request for the identity (approved through approve_verification when asked), once. */
export async function verificationRequest(deps: EnrollmentDeps, identityId: string, decision: 'pending' | 'approved'): Promise<void> {
  const { verification_requests: existing } = await deps.clients.admin.request<{ verification_requests: { id: string }[] }>(
    REQUESTS,
    { id: identityId },
  );
  if (existing.length > 0) return;
  const { insert_verification_requests_one: request } = await deps.clients.actor.request<{
    insert_verification_requests_one: { id: string };
  }>(INSERT_REQUEST, {
    object: { organization_id: deps.organizationId, identity_id: identityId, reason: 'Confirm identity against ID document' },
  });
  if (decision === 'approved') {
    await deps.clients.actor.request(APPROVE, { id: request.id, reason: 'ID document checked at reception' });
  }
}
