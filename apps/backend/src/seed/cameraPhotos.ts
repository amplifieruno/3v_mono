import { basename } from 'node:path';
import { loadFaceManifest } from './faceManifest.js';
import type { SeedPeopleResult } from './people.js';
import type { SeedContext } from './tenancy.js';

const PHOTOS = `
  query SeedCameraPhotos($where: identity_photos_bool_exp!) { identity_photos(where: $where) { id } }
`;
const SET_DEVICE = `
  mutation SeedPhotoDevice($ids: [uuid!]!, $device: uuid!) {
    update_identity_photos(
      where: { id: { _in: $ids }, _or: [{ device_id: { _is_null: true } }, { device_id: { _neq: $device } }] }
      _set: { device_id: $device }
    ) { affected_rows }
  }
`;

/**
 * Faces cut from a stream-server video were "seen" by the camera of that stream: their identity photos get that
 * camera as capturing device. People are matched to profiles exactly as seedFaces assigns them (the role's profiles
 * in manifest order); camera identities by their `attributes.seed_ref` (`<folder>/a`, `/b`, `/camera`).
 * Only photos whose device differs are updated, so a re-run writes nothing.
 */
export async function repointCameraPhotos(
  ctx: SeedContext,
  organizationId: string,
  people: SeedPeopleResult,
  cameraByStream: Record<string, string>,
): Promise<void> {
  const used: Record<string, number> = {};
  for (const person of await loadFaceManifest()) {
    let profileId: string | undefined;
    if (person.role !== 'unknown') {
      const index = used[person.role] ?? 0;
      used[person.role] = index + 1;
      profileId = people.byRole[person.role][index];
    }
    const device = cameraByStream[basename(person.source, '.mp4')];
    if (!device) continue;

    const refs = ['a', 'b', 'camera'].map((suffix) => ({
      identity: { attributes: { _contains: { seed_ref: `${person.folder}/${suffix}` } } },
    }));
    const where = {
      organization_id: { _eq: organizationId },
      _or: [...refs, ...(profileId ? [{ identity: { profile_id: { _eq: profileId } } }] : [])],
    };
    const { identity_photos: photos } = await ctx.admin.request<{ identity_photos: { id: string }[] }>(PHOTOS, { where });
    if (photos.length === 0) continue;
    await ctx.admin.request(SET_DEVICE, { ids: photos.map((p) => p.id), device });
  }
}
