import { type FlowConfig, cond, ref } from '@burojs/core';
import { NAV_ICONS } from '../../app/nav';
import { facePhotos } from '../../fields/face-photos';
import {
  ENROLLMENT_MAX_PHOTOS,
  addIdentityPhotos,
  createIdentityFromPhotos,
  enrollFace,
} from './enrollment';
import { enrollmentResultBlock } from './enrollment-result-block';

/** The one form field of every enrollment flow: 1 to 5 photos, uploaded or taken with the camera. */
const photoFields = {
  photos: facePhotos({
    min: 1,
    max: ENROLLMENT_MAX_PHOTOS,
    texts: {
      label: 'Photos',
      doc: {
        summary:
          'One to five photos of the person’s face: alone in the picture, facing the camera, well lit and not too small. Upload JPEG, PNG or WebP files or take them with the camera; the platform checks each one and says which it refused and why.',
      },
    },
  }),
};

/** A flow form starts from `initial`, not from the fields' defaults (`tasks/ui/buro-gaps.md` G20). */
const form = { fields: photoFields, initial: { photos: { kind: 'literal', value: [] } } } as const;

/** The action's answer, shown in the flow's host (`itap:enrollment-result`). */
const showResult = {
  open: {
    block: enrollmentResultBlock,
    props: {
      identityId: ref('result', 'identity_id'),
      identityCode: ref('result', 'identity_code'),
      photosAdded: ref('result', 'photos_added'),
      templates: ref('result', 'templates'),
      rejected: ref('result', 'rejected'),
      photoIds: ref('values', 'photos'),
    },
  },
};

/**
 * "Create identity from photos" on the identity list: a new unknown identity from 1–5 photos.
 * A face that matches an existing identity is refused on the form with that identity's code;
 * when no photo shows a usable face, the form names each photo and why. Never resent by itself:
 * a lost answer may have created the identity (the unknown screen sends the user to the list).
 */
export const createIdentityFlow = {
  texts: {
    label: 'Create identity from photos',
    doc: {
      summary:
        'Creates an identity for a person not yet known to the platform from one to five face photos, so cameras recognise them from now on. Link it to a profile afterwards, or use Enroll face on the profile instead.',
    },
  },
  icon: NAV_ICONS.createIdentity,
  surfaces: { list: 'regular' },
  form,
  submit: { mutation: createIdentityFromPhotos, retry: 'never', input: { fileIds: ref('values', 'photos') } },
  then: showResult,
} satisfies FlowConfig<unknown, Record<never, never>, typeof photoFields>;

/**
 * "Add photos" on an identity: offered while it is neither merged nor archived; disabled with
 * the reason while matching is off (`./identity-rules.ts`). Photos whose face is closer to
 * another identity are refused as conflicting; the others are added.
 */
export const addPhotosFlow = {
  texts: {
    label: 'Add photos',
    doc: {
      summary:
        'Adds one to five face photos to the identity, which helps recognition in other light and angles. Photos showing someone else are refused.',
    },
  },
  icon: NAV_ICONS.addPhotos,
  surfaces: { default: false, show: 'auto' },
  when: cond.not(cond.in(ref('record', 'status'), ['merged', 'archived'])),
  form,
  submit: {
    mutation: addIdentityPhotos,
    retry: 'never',
    input: { identityId: ref('record', 'id'), fileIds: ref('values', 'photos') },
  },
  then: showResult,
} satisfies FlowConfig<unknown, Record<never, never>, typeof photoFields>;

/**
 * "Enroll face" on a profile: the photos go to the person's primary identity, else to a matching
 * identity (then linked), else to a new identity linked to the profile. Disabled with the reason
 * on an erased or restricted profile (`./profile-rules.ts`); a withdrawn biometric consent or a
 * face linked to another profile is refused on the form.
 */
export const enrollFaceFlow = {
  texts: {
    label: 'Enroll face',
    doc: {
      summary:
        'Teaches the platform the person’s face from one to five photos, so cameras and face authentication recognise them. Enrolling again adds the photos to the same identity.',
    },
  },
  icon: NAV_ICONS.enrollFace,
  surfaces: { default: false, show: 'auto' },
  form,
  submit: {
    mutation: enrollFace,
    retry: 'never',
    input: { profileId: ref('record', 'id'), fileIds: ref('values', 'photos') },
  },
  then: showResult,
} satisfies FlowConfig<unknown, Record<never, never>, typeof photoFields>;
