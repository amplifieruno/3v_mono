import { enrollForProfile, type EnrollmentDeps } from '../face/enrollmentService.js';
import { createInsightFaceClient } from '../face/insightFaceClient.js';
import { createHasuraClient } from '../hasura/client.js';
import { facePhotos, loadFaceManifest, mirroredPhoto, type FacePerson } from './faceManifest.js';
import { cameraIdentity, duplicateCandidate, mergeOnce, verificationRequest } from './faceReview.js';
import type { SeedPeopleResult } from './people.js';
import { daysFrom } from './random.js';
import type { SeedContext, SeedTenancyResult } from './tenancy.js';

/** Ids of every Nova Tower identity created by the seed (active and merged). */
export type SeedIdentitiesResult = string[];

const PROFILES = `
  query SeedFaceProfiles($ids: [uuid!]!) {
    profiles(where: { id: { _in: $ids } }) {
      id identities(where: { is_primary_for_profile: { _eq: true } }) { id }
    }
  }
`;

type Known = { person: FacePerson; profileId: string; identityId: string };

/** Enrolls the person's photos for the profile (same code path as enroll_face) unless the profile has a face. */
async function enrollKnown(deps: EnrollmentDeps, person: FacePerson, profileId: string, keepLast: boolean): Promise<string> {
  const { profiles } = await deps.clients.admin.request<{ profiles: { id: string; identities: { id: string }[] }[] }>(
    PROFILES,
    { ids: [profileId] },
  );
  const primary = profiles[0]?.identities[0]?.id;
  if (primary) return primary;
  const files = keepLast ? person.files.slice(0, -1) : person.files;
  const outcome = await enrollForProfile(deps, { profileId, photos: await facePhotos(person, files) });
  return outcome.identityId;
}

/**
 * Faces of Nova Tower from `seed-assets/faces`: employees, VIPs and the blacklisted person become enrolled faces
 * of their profiles (the role's profiles in plan order); each `unknown` person becomes two unlinked camera
 * identities with an open duplicate candidate. The first video employee with 3+ photos also gets a camera identity of
 * their last photo that is merged into the enrolled one; a few identities get verification requests.
 */
export async function seedFaces(
  ctx: SeedContext,
  tenancy: SeedTenancyResult,
  people: SeedPeopleResult,
): Promise<SeedIdentitiesResult> {
  const organizationId = tenancy.orgs.nova;
  const deps: EnrollmentDeps = {
    clients: {
      admin: ctx.admin,
      actor: createHasuraClient(ctx.env, { role: 'admin', userId: tenancy.users.admin, organizationId }),
    },
    storage: ctx.storage,
    insightFace: createInsightFaceClient(ctx.env.INSIGHTFACE_API_URL),
    organizationId,
  };
  const manifest = await loadFaceManifest();
  const used: Record<string, number> = {};
  const known: Known[] = [];
  const identities: string[] = [];
  const unknown: string[] = [];
  let mergeDone = false;

  for (const person of manifest) {
    if (person.role === 'unknown') {
      // Two camera tracks of the same stranger: the photos split in two, or the single photo and its mirror image.
      const half = Math.ceil(person.files.length / 2);
      const second = person.files.length > 1 ? await facePhotos(person, person.files.slice(half)) : [await mirroredPhoto(person)];
      const a = await cameraIdentity(deps, `${person.folder}/a`, await facePhotos(person, person.files.slice(0, half)));
      const b = await cameraIdentity(deps, `${person.folder}/b`, second);
      await duplicateCandidate(deps, a.id, b.id, daysFrom(ctx.now, -2));
      identities.push(a.id, b.id);
      unknown.push(a.id);
      continue;
    }
    const pool = people.byRole[person.role];
    const index = used[person.role] ?? 0;
    used[person.role] = index + 1;
    const profileId = pool[index];
    if (!profileId) throw new Error(`seed: not enough ${person.role} profiles for face ${person.folder}`);

    const mergeDemo = !mergeDone && person.role === 'employee' && person.files.length >= 3;
    const identityId = await enrollKnown(deps, person, profileId, mergeDemo);
    identities.push(identityId);
    known.push({ person, profileId, identityId });
    if (mergeDemo) {
      mergeDone = true;
      const last = person.files[person.files.length - 1];
      const camera = await cameraIdentity(deps, `${person.folder}/camera`, await facePhotos(person, [last]));
      identities.push(camera.id);
      await duplicateCandidate(deps, identityId, camera.id, daysFrom(ctx.now, -3));
      await mergeOnce(deps, identityId, camera, 'Same person: camera track of an enrolled employee');
    }
  }

  // Verification: the VIP and the merge-demo employee approved; one other employee and one camera identity pending.
  const vip = known.find((k) => k.person.role === 'vip');
  const employees = known.filter((k) => k.person.role === 'employee');
  if (vip) await verificationRequest(deps, vip.identityId, 'approved');
  if (employees[0]) await verificationRequest(deps, employees[0].identityId, 'approved');
  if (employees[1]) await verificationRequest(deps, employees[1].identityId, 'pending');
  if (unknown[0]) await verificationRequest(deps, unknown[0], 'pending');
  return identities;
}
