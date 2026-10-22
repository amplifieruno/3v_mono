import { defineMutation } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { IDENTITY_RESOURCE, PROFILE_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { enrollmentRefusals } from './enrollment-refusals';
import { PEOPLE_BINDING } from './profile-activity';

/** Photos one enrollment request takes in the console (the actions accept up to 10). */
export const ENROLLMENT_MAX_PHOTOS = 5;

const fileIds = z.array(z.string().uuid()).min(1).max(ENROLLMENT_MAX_PHOTOS);

/**
 * What every enrollment action answers (`EnrollmentResult`): the identity the photos went to,
 * how many were added, its face templates now, and each refused photo with the reason.
 */
export const enrollmentResult = z.object({
  identity_id: z.string(),
  identity_code: z.string(),
  photos_added: z.number().int(),
  templates: z.number().int(),
  rejected: z.array(z.object({ file_id: z.string(), reason: z.string() })),
});

export type EnrollmentResult = z.infer<typeof enrollmentResult>;

const RESULT = 'identity_id identity_code photos_added templates rejected { file_id reason }';

/** Refreshed after any enrollment: identities (photos, primary photo) and profiles (face linked). */
const effects = [{ resource: IDENTITY_RESOURCE }, { resource: PROFILE_RESOURCE }];

export const createIdentityFromPhotosInput = z.object({ fileIds });

/** `create_identity_from_photos(file_ids, attributes)` (org_admin). */
export const createIdentityFromPhotosOperation = hasuraOperation(
  PEOPLE_BINDING,
  'createIdentityFromPhotos',
  {
    kind: 'mutation',
    document: `mutation CreateIdentityFromPhotos($files: [uuid!]!) {
  create_identity_from_photos(file_ids: $files) { ${RESULT} }
}`,
    variables: (input) => ({ files: (input as z.infer<typeof createIdentityFromPhotosInput>).fileIds }),
    mapResult: (data) => rootOf(data, 'create_identity_from_photos'),
  },
  enrollmentRefusals(
    'This face already belongs to {{code}}. Add the photos to that identity instead; nothing was saved.',
  ),
);

/**
 * Creates an unknown identity (source `manual`) from face photos. Each photo is checked by the
 * platform: one face, good enough quality; refused photos come back with the reason and the
 * others are kept. A face that matches an existing identity refuses the whole request.
 */
export const createIdentityFromPhotos = defineMutation('itap:create-identity-from-photos', {
  binding: createIdentityFromPhotosOperation.binding,
  input: schema(createIdentityFromPhotosInput),
  output: schema(enrollmentResult),
  effects,
});

export const addIdentityPhotosInput = z.object({ identityId: z.string().uuid(), fileIds });

/** `add_identity_photos(identity_id, file_ids)` (org_admin). */
export const addIdentityPhotosOperation = hasuraOperation(
  PEOPLE_BINDING,
  'addIdentityPhotos',
  {
    kind: 'mutation',
    document: `mutation AddIdentityPhotos($identity: uuid!, $files: [uuid!]!) {
  add_identity_photos(identity_id: $identity, file_ids: $files) { ${RESULT} }
}`,
    variables: (input) => {
      const { identityId, fileIds: files } = input as z.infer<typeof addIdentityPhotosInput>;
      return { identity: identityId, files };
    },
    mapResult: (data) => rootOf(data, 'add_identity_photos'),
  },
  enrollmentRefusals('This face already belongs to {{code}}. Nothing was saved.'),
);

/**
 * Adds face photos to an active identity. A photo whose face is closer to another identity is
 * refused as conflicting (a merge may be due); the rest are added.
 */
export const addIdentityPhotos = defineMutation('itap:add-identity-photos', {
  binding: addIdentityPhotosOperation.binding,
  input: schema(addIdentityPhotosInput),
  output: schema(enrollmentResult),
  effects,
});

export const enrollFaceInput = z.object({ profileId: z.string().uuid(), fileIds });

/** `enroll_face(profile_id, file_ids)` (org_admin). */
export const enrollFaceOperation = hasuraOperation(
  PEOPLE_BINDING,
  'enrollFace',
  {
    kind: 'mutation',
    document: `mutation EnrollFace($profile: uuid!, $files: [uuid!]!) {
  enroll_face(profile_id: $profile, file_ids: $files) { ${RESULT} }
}`,
    variables: (input) => {
      const { profileId, fileIds: files } = input as z.infer<typeof enrollFaceInput>;
      return { profile: profileId, files };
    },
    mapResult: (data) => rootOf(data, 'enroll_face'),
  },
  enrollmentRefusals(
    'This face belongs to {{code}}, which is linked to another profile. Nothing was saved: check whether the two profiles are the same person.',
  ),
);

/**
 * Enrolls a face for a profile: the photos go to the person's primary identity, or to a
 * matching identity that is then linked, or to a new identity linked to the profile. Never
 * creates a second identity for the same face. Refused while processing is restricted or
 * biometric consent is withdrawn.
 */
export const enrollFace = defineMutation('itap:enroll-face', {
  binding: enrollFaceOperation.binding,
  input: schema(enrollFaceInput),
  output: schema(enrollmentResult),
  effects,
});
