import { randomUUID } from 'node:crypto';
import { DEFAULT_MODEL_VERSION, detectedAttributes, type EnrollmentDeps } from './enrollmentService.js';
import { commitPhotos, type AcceptedPhoto } from './enrollmentSteps.js';

const IDENTITY_CODE = `
  query CameraIdentityCode($id: uuid!) { identities_by_pk(id: $id) { code } }
`;

export type CameraIdentity = { id: string; code: string; cropFileIds: string[] };

/**
 * Camera path of identity creation: a new unlinked identity (source `camera`) from captured faces, without a
 * duplicate check (the caller already matched; a camera track of a known face is what the duplicate-candidate queue
 * reviews). Each face becomes a crop in the organization bucket, an identity photo (kind `capture`, with the
 * capturing device and time when given) and an embedding, in one transaction. Used by the live recognition
 * pipeline and the seed.
 */
export async function createCameraIdentity(
  deps: EnrollmentDeps,
  captures: AcceptedPhoto[],
  options: { attributes?: Record<string, unknown>; deviceId?: string; capturedAt?: Date } = {},
): Promise<CameraIdentity> {
  const id = randomUUID();
  const photoFields = {
    ...(options.deviceId ? { device_id: options.deviceId } : {}),
    ...(options.capturedAt ? { captured_at: options.capturedAt.toISOString() } : {}),
  };
  const cropFileIds = await commitPhotos(
    {
      actor: deps.clients.actor,
      storage: deps.storage,
      organizationId: deps.organizationId,
      modelVersion: deps.modelVersion ?? DEFAULT_MODEL_VERSION,
    },
    {
      identityId: id,
      newIdentity: {
        organization_id: deps.organizationId,
        source: 'camera',
        attributes: { ...detectedAttributes(captures), ...(options.attributes ?? {}) },
      },
      photoFields,
    },
    'capture',
    captures,
  );
  const data = await deps.clients.admin.request<{ identities_by_pk: { code: string } | null }>(IDENTITY_CODE, { id });
  if (!data.identities_by_pk) throw new Error(`Created camera identity ${id} not found`);
  return { id, code: data.identities_by_pk.code, cropFileIds };
}
