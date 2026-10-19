import { randomUUID } from 'node:crypto';
import type { HasuraClient } from '../hasura/client.js';
import type { StorageClient } from '../storage/storageClient.js';
import { analyzePhotos, commitPhotos, type AcceptedPhoto, type FaceMatch, type Rejected } from './enrollmentSteps.js';
import type { InsightFaceClient } from './insightFaceClient.js';
import type { PhotoSource } from './photoSources.js';

/** Recorded on embeddings; matches the recognizer the compose `insightface` service loads (REC_NAME). */
export const DEFAULT_MODEL_VERSION = 'insightface:w600k_mbf';

export type EnrollmentDeps = {
  clients: {
    /** Admin secret without a session: reads. */
    admin: HasuraClient;
    /** Admin secret with the caller's organization (and user) headers: match_face scoping and audited writes. */
    actor: HasuraClient;
  };
  storage: StorageClient;
  insightFace: InsightFaceClient;
  organizationId: string;
  modelVersion?: string;
};

export type EnrollmentOutcome = {
  identityId: string;
  identityCode: string;
  photosAdded: number;
  templates: number;
  rejected: { ref: string; reason: Rejected['reason'] }[];
};

/** Business refusal; the action layer maps it to ActionError(code, message). */
export class EnrollmentError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'EnrollmentError';
    this.code = code;
  }
}

type IdentityRow = { id: string; code: string; profile_id: string | null; is_primary_for_profile: boolean; status: string };

const IDENTITIES = `
  query EnrollmentIdentities($where: identities_bool_exp!) {
    identities(where: $where, order_by: { number: asc }) { id code profile_id is_primary_for_profile status }
  }
`;
const PROFILE = `
  query EnrollmentProfile($id: uuid!, $org: uuid!) {
    profiles(where: { id: { _eq: $id }, organization_id: { _eq: $org } }) { id }
  }
`;
const LINK = `
  mutation EnrollmentLink($id: uuid!, $profile: uuid!) {
    update_identities(
      where: { id: { _eq: $id }, _or: [{ profile_id: { _is_null: true } }, { profile_id: { _eq: $profile } }] },
      _set: { profile_id: $profile, is_primary_for_profile: true, link_strength: 1 }
    ) { affected_rows }
  }
`;
const TEMPLATES = `
  query EnrollmentTemplates($id: uuid!) {
    identity_embeddings_aggregate(where: { identity_id: { _eq: $id }, is_template: { _eq: true } }) {
      aggregate { count }
    }
  }
`;

async function findIdentities(deps: EnrollmentDeps, where: Record<string, unknown>): Promise<IdentityRow[]> {
  const { identities } = await deps.clients.admin.request<{ identities: IdentityRow[] }>(IDENTITIES, {
    where: { organization_id: { _eq: deps.organizationId }, ...where },
  });
  return identities;
}

async function identityById(deps: EnrollmentDeps, id: string): Promise<IdentityRow | undefined> {
  return (await findIdentities(deps, { id: { _eq: id } }))[0];
}

async function duplicateOf(deps: EnrollmentDeps, match: FaceMatch): Promise<EnrollmentError> {
  const identity = await identityById(deps, match.identity_id);
  return new EnrollmentError('duplicate_identity', identity?.code ?? match.identity_id);
}

/** Nearest match over all accepted photos that satisfies `pick`. */
function nearest(accepted: AcceptedPhoto[], pick: (m: FaceMatch) => boolean): FaceMatch | undefined {
  return accepted
    .map((p) => p.match)
    .filter((m): m is FaceMatch => m !== null && pick(m))
    .sort((a, b) => a.distance - b.distance)[0];
}

function noValidPhotos(rejected: Rejected[]): EnrollmentError {
  const reasons = rejected.map((r) => `${r.ref}: ${r.reason}`).join(', ');
  return new EnrollmentError('no_valid_photos', `No usable face in the photos (${reasons || 'none given'})`);
}

/** Detected age/gender of the best photo, used as initial attributes of a new identity. */
function detectedAttributes(accepted: AcceptedPhoto[]): Record<string, unknown> {
  const best = [...accepted].sort((a, b) => b.quality - a.quality)[0];
  if (!best) return {};
  return {
    ...(best.face.age !== undefined ? { age: best.face.age } : {}),
    ...(best.face.gender !== undefined ? { gender: best.face.gender } : {}),
  };
}

async function finish(
  deps: EnrollmentDeps,
  identity: { id: string; code: string },
  photosAdded: number,
  rejected: Rejected[],
): Promise<EnrollmentOutcome> {
  const data = await deps.clients.admin.request<{
    identity_embeddings_aggregate: { aggregate: { count: number } };
  }>(TEMPLATES, { id: identity.id });
  return {
    identityId: identity.id,
    identityCode: identity.code,
    photosAdded,
    templates: data.identity_embeddings_aggregate.aggregate.count,
    rejected: [...rejected].sort((a, b) => a.index - b.index).map(({ ref, reason }) => ({ ref, reason })),
  };
}

function commitDeps(deps: EnrollmentDeps) {
  return {
    actor: deps.clients.actor,
    storage: deps.storage,
    organizationId: deps.organizationId,
    modelVersion: deps.modelVersion ?? DEFAULT_MODEL_VERSION,
  };
}

/** Creates a new identity from accepted photos and returns its id and code. */
async function createIdentity(
  deps: EnrollmentDeps,
  accepted: AcceptedPhoto[],
  kind: 'enrollment' | 'manual',
  object: Record<string, unknown>,
): Promise<{ id: string; code: string }> {
  const id = randomUUID();
  await commitPhotos(commitDeps(deps), { identityId: id, newIdentity: { organization_id: deps.organizationId, ...object } }, kind, accepted);
  const created = await identityById(deps, id);
  if (!created) throw new Error(`Created identity ${id} not found`);
  return created;
}

/**
 * enroll_face (FS §2.1): adds the photos to the profile's identity, never creating a duplicate. Target, in order:
 * the profile's primary identity; else its nearest matched identity already linked to the profile, or the nearest
 * matched unlinked identity (linked and made primary); else a new identity (source `enrollment`). A face matching an
 * identity linked to another profile refuses the whole request with `duplicate_identity` (its code), writing nothing.
 */
export async function enrollForProfile(
  deps: EnrollmentDeps,
  input: { profileId: string; photos: PhotoSource[] },
): Promise<EnrollmentOutcome> {
  const { profiles } = await deps.clients.admin.request<{ profiles: { id: string }[] }>(PROFILE, {
    id: input.profileId,
    org: deps.organizationId,
  });
  if (profiles.length === 0) throw new EnrollmentError('profile_not_found', 'Profile not found');

  const { accepted, rejected } = await analyzePhotos(input.photos, deps.insightFace, deps.clients.actor);
  const foreign = nearest(accepted, (m) => m.profile_id !== null && m.profile_id !== input.profileId);
  if (foreign) throw await duplicateOf(deps, foreign);

  const primary = (await findIdentities(deps, { profile_id: { _eq: input.profileId }, is_primary_for_profile: { _eq: true } }))[0];
  let target: { id: string; code: string } | undefined = primary;
  if (!target) {
    const match = nearest(accepted, (m) => m.profile_id === input.profileId) ?? nearest(accepted, (m) => m.profile_id === null);
    if (match) {
      const { update_identities: linked } = await deps.clients.actor.request<{ update_identities: { affected_rows: number } }>(
        LINK,
        { id: match.identity_id, profile: input.profileId },
      );
      if (linked.affected_rows !== 1) throw new EnrollmentError('identity_conflict', 'The matched identity changed; retry');
      target = await identityById(deps, match.identity_id);
    }
  }
  if (target) {
    await commitPhotos(commitDeps(deps), { identityId: target.id }, 'enrollment', accepted);
    return finish(deps, target, accepted.length, rejected);
  }

  if (accepted.length === 0) throw noValidPhotos(rejected);
  const created = await createIdentity(deps, accepted, 'enrollment', {
    source: 'enrollment',
    profile_id: input.profileId,
    is_primary_for_profile: true,
    link_strength: 1,
    attributes: detectedAttributes(accepted),
  });
  return finish(deps, created, accepted.length, rejected);
}

/** create_identity_from_photos: a new unlinked identity (source `manual`); any face match → `duplicate_identity`. */
export async function createIdentityFromImages(
  deps: EnrollmentDeps,
  input: { photos: PhotoSource[]; attributes?: Record<string, unknown> },
): Promise<EnrollmentOutcome> {
  const { accepted, rejected } = await analyzePhotos(input.photos, deps.insightFace, deps.clients.actor);
  const match = nearest(accepted, () => true);
  if (match) throw await duplicateOf(deps, match);
  if (accepted.length === 0) throw noValidPhotos(rejected);

  const created = await createIdentity(deps, accepted, 'manual', {
    source: 'manual',
    attributes: { ...detectedAttributes(accepted), ...(input.attributes ?? {}) },
  });
  return finish(deps, created, accepted.length, rejected);
}

/**
 * add_identity_photos: adds photos to an active identity. A photo whose nearest match is a different identity is
 * rejected as `conflicting_identity` (FS §2.2: the conflict is returned for resolution, e.g. a merge).
 */
export async function addPhotosToIdentity(
  deps: EnrollmentDeps,
  input: { identityId: string; photos: PhotoSource[] },
): Promise<EnrollmentOutcome> {
  const identity = await identityById(deps, input.identityId);
  if (!identity) throw new EnrollmentError('identity_not_found', 'Identity not found');
  if (identity.status === 'merged' || identity.status === 'archived') {
    throw new EnrollmentError('identity_not_active', `Identity is ${identity.status}`);
  }

  const analyzed = await analyzePhotos(input.photos, deps.insightFace, deps.clients.actor);
  const rejected = [...analyzed.rejected];
  const accepted = analyzed.accepted.filter((photo) => {
    if (!photo.match || photo.match.identity_id === identity.id) return true;
    rejected.push({ index: photo.index, ref: photo.source.ref, reason: 'conflicting_identity' });
    return false;
  });
  await commitPhotos(commitDeps(deps), { identityId: identity.id }, 'manual', accepted);
  return finish(deps, identity, accepted.length, rejected);
}
