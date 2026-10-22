import { type DataError, defineDataProvider, defineMutationHandler } from '@burojs/core';
import { answer, reject, runFlow } from '@burojs/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import { withActionRefusals } from '../../src/data/action-refusals';
import { IDENTITY_RESOURCE, PROFILE_RESOURCE } from '../../src/data/resource-names';
import { validateFacePhotos } from '../../src/fields/face-photos-format';
import { ACTION_REFUSALS } from '../../src/modules';
import { enrollmentRefusals, rejectedPhotoLines } from '../../src/modules/people/enrollment-refusals';
import { PEOPLE_BINDING } from '../../src/modules/people/profile-activity';

/**
 * Enrollment without the UI: what the three flows send, how the actions' refusals read on the
 * form (which photo failed and why, Review Focus 1), and where the flows are offered.
 */

const ADMIN = { id: 'u1', roles: ['org_admin'] };
const ANNA = '33333333-3333-4333-8333-000000000001';
const IDENTITY = '66666666-6666-4666-8666-000000000001';
const P1 = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const P2 = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002';

const anna = { id: ANNA, first_name: 'Anna', last_name: 'Petrova', profile_type: 'employee', processing_restricted: false, erased_at: null };
const face = {
  id: IDENTITY,
  code: 'IDENTITY-00012',
  status: 'unverified',
  matching_enabled: true,
  is_synthetic: false,
  profile_id: null,
};

const RESULT = { identity_id: IDENTITY, identity_code: 'IDENTITY-00012', photos_added: 1, templates: 3, rejected: [{ file_id: P2, reason: 'no_face' }] };

const target = (resource: string, action: string) => ({ resource, action }) as const;

/** The refusal of `no_valid_photos` as the provider wrapper turns it into a form issue. */
const noValidPhotos: DataError = {
  kind: 'validation',
  code: 'no_valid_photos',
  message: '',
  details: {
    issues: [
      {
        code: 'no_valid_photos',
        message: { key: 'validation.itap.action.no_valid_photos', default: 'No photo shows a usable face, so nothing was saved. Photo 1: no face found.' },
        path: ['fileIds'],
      },
    ],
  },
};

beforeAll(async () => {
  await app.ready;
});

describe('enrollment flows', () => {
  it('should create an identity from the chosen photos and open the result', async () => {
    const flow = await runFlow(app, target(IDENTITY_RESOURCE, 'create_from_photos'), {
      user: ADMIN,
      mutations: { 'itap:create-identity-from-photos': [answer(RESULT)] },
    }).open();
    flow.fill({ photos: [P1, P2] });
    await flow.submit();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({ input: { fileIds: [P1, P2] } });
    expect(flow.state.effects?.open).toMatchObject({
      props: { identityCode: 'IDENTITY-00012', photosAdded: 1, rejected: [{ file_id: P2, reason: 'no_face' }], photoIds: [P1, P2] },
    });
  });

  it('should not send without a photo, nor with more than five', async () => {
    const flow = await runFlow(app, target(IDENTITY_RESOURCE, 'create_from_photos'), { user: ADMIN }).open();
    await flow.submit();
    flow.assertNotSubmitted();
    const six = Array.from({ length: 6 }, (_, i) => `aaaaaaaa-aaaa-4aaa-8aaa-00000000001${i}`);
    flow.fill({ photos: six });
    await flow.submit();
    flow.assertNotSubmitted();
    expect(JSON.stringify(flow.state)).toContain('Use at most 5 photos; remove 1.');
  });

  it('should show which photo failed and why on the form when no photo was usable (Review Focus 1)', async () => {
    const flow = await runFlow(app, target(PROFILE_RESOURCE, 'enroll_face'), {
      user: ADMIN,
      record: anna,
      rows: { [PROFILE_RESOURCE]: [anna] },
      mutations: { 'itap:enroll-face': [reject(noValidPhotos)] },
    }).open();
    flow.fill({ photos: [P1] });
    await flow.submit();
    flow.assertOutcome('rejected');
    expect(flow.submitted[0]?.call).toMatchObject({ input: { profileId: ANNA, fileIds: [P1] } });
    expect(JSON.stringify(flow.state)).toContain('Photo 1: no face found.');
  });

  it('should add photos to an active identity, disable it on a merged one and not offer it on an archived one', async () => {
    const flow = await runFlow(app, target(IDENTITY_RESOURCE, 'add_photos'), {
      user: ADMIN,
      record: face,
      rows: { [IDENTITY_RESOURCE]: [face] },
      mutations: { 'itap:add-identity-photos': [answer(RESULT)] },
    }).open();
    flow.fill({ photos: [P1] });
    await flow.submit();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({ input: { identityId: IDENTITY, fileIds: [P1] } });
    const merged = { ...face, status: 'merged' };
    (await runFlow(app, target(IDENTITY_RESOURCE, 'add_photos'), { user: ADMIN, record: merged, rows: { [IDENTITY_RESOURCE]: [merged] } }).open()).assertDisabled(/merged into another one/);
    const archived = { ...face, status: 'archived' };
    (await runFlow(app, target(IDENTITY_RESOURCE, 'add_photos'), { user: ADMIN, record: archived, rows: { [IDENTITY_RESOURCE]: [archived] } }).open()).assertUnavailable();
  });

  it('should disable Add photos while matching is off, and Enroll face on a restricted or erased profile', async () => {
    const off = { ...face, matching_enabled: false };
    (await runFlow(app, target(IDENTITY_RESOURCE, 'add_photos'), { user: ADMIN, record: off, rows: { [IDENTITY_RESOURCE]: [off] } }).open()).assertDisabled(/withdrew biometric consent/);
    const restricted = { ...anna, processing_restricted: true };
    (await runFlow(app, target(PROFILE_RESOURCE, 'enroll_face'), { user: ADMIN, record: restricted, rows: { [PROFILE_RESOURCE]: [restricted] } }).open()).assertDisabled(/restricted/);
    const erased = { ...restricted, erased_at: '2026-10-02T09:00:00Z' };
    (await runFlow(app, target(PROFILE_RESOURCE, 'enroll_face'), { user: ADMIN, record: erased, rows: { [PROFILE_RESOURCE]: [erased] } }).open()).assertDisabled(/tombstone/);
  });
});

describe('enrollment refusals', () => {
  const read = enrollmentRefusals('Belongs to {{code}}.');

  it('should number each refused photo as the form listed it', () => {
    const message = `No usable face in the photos (${P2}: low_quality, ${P1.toUpperCase()}: multiple_faces)`;
    expect(rejectedPhotoLines(message, [P1, P2])).toEqual([
      'Photo 2: the face is too small, blurred, dark or turned away.',
      'Photo 1: more than one face; use a photo of the person alone.',
    ]);
    expect(read({ code: 'no_valid_photos', message }, { fileIds: [P1, P2] })?.[0]).toMatchObject({ path: ['fileIds'] });
  });

  it('should name the identity a duplicate face belongs to, and leave unknown codes alone', () => {
    expect(read({ code: 'duplicate_identity', message: 'IDENTITY-00007' }, { fileIds: [P1] })).toEqual([
      { code: 'duplicate_identity', message: 'Belongs to IDENTITY-00007.', path: ['fileIds'] },
    ]);
    expect(read({ code: 'consent_withdrawn', message: '' }, {})?.[0]?.path).toEqual([]);
    expect(read({ code: 'internal', message: 'Internal error' }, {})).toBeNull();
  });

  it('should register a reader for each enrollment action, identity governance write and visit step', () => {
    expect(Object.keys(ACTION_REFUSALS).sort()).toEqual([
      `${PEOPLE_BINDING}.addIdentityPhotos`,
      `${PEOPLE_BINDING}.addIdentityRelationship`,
      `${PEOPLE_BINDING}.approveVerification`,
      `${PEOPLE_BINDING}.cancelVisit`,
      `${PEOPLE_BINDING}.checkInVisit`,
      `${PEOPLE_BINDING}.checkOutVisit`,
      `${PEOPLE_BINDING}.createIdentityFromPhotos`,
      `${PEOPLE_BINDING}.enrollFace`,
      `${PEOPLE_BINDING}.mergeIdentities`,
      `${PEOPLE_BINDING}.rejectVerification`,
      `${PEOPLE_BINDING}.rollbackMerge`,
      `${PEOPLE_BINDING}.splitIdentity`,
    ]);
  });

  it('should not claim nothing was saved for the refusals Enroll face may raise after linking', () => {
    for (const code of ['subject_restricted', 'identity_merged_frozen', 'identity_matching_disabled']) {
      expect(read({ code, message: '' }, { fileIds: [P1] })?.[0]?.message).not.toMatch(/Nothing was saved/);
    }
  });
});

describe('withActionRefusals', () => {
  const hasuraError = (code: string, message: string): DataError => ({
    kind: 'protocol',
    code: 'graphql-error',
    message,
    details: [{ message, extensions: { code } }],
  });
  const providerFailing = (error: DataError) =>
    withActionRefusals(
      defineDataProvider({ mutations: { custom: defineMutationHandler(async () => Promise.reject(error)) } }),
      { [`${PEOPLE_BINDING}.enrollFace`]: enrollmentRefusals('Belongs to {{code}}.') },
    );
  const call = (operation: string) =>
    ({ kind: 'custom', resource: PEOPLE_BINDING, operation, input: { fileIds: [P1] } }) as never;

  it('should turn a listed action code into a validation refusal with the form issue', async () => {
    const provider = providerFailing(hasuraError('duplicate_identity', 'IDENTITY-00003'));
    await expect(provider.mutations?.custom?.(call('enrollFace'), {} as never)).rejects.toMatchObject({
      kind: 'validation',
      code: 'duplicate_identity',
      details: {
        issues: [
          {
            message: { key: 'validation.itap.action.duplicate_identity', default: 'Belongs to IDENTITY-00003.' },
            path: ['fileIds'],
            severity: 'error',
          },
        ],
      },
    });
  });

  it('should pass other codes and other operations through unchanged', async () => {
    const internal = hasuraError('internal', 'Internal error');
    await expect(providerFailing(internal).mutations?.custom?.(call('enrollFace'), {} as never)).rejects.toBe(internal);
    const refused = hasuraError('duplicate_identity', 'IDENTITY-00003');
    await expect(providerFailing(refused).mutations?.custom?.(call('mergeProfiles'), {} as never)).rejects.toBe(refused);
  });
});

describe('face photos count', () => {
  it('should leave an empty list to required and refuse fewer than min or more than max', () => {
    expect(validateFacePhotos([], { min: 3, max: 5 })).toBeNull();
    expect(validateFacePhotos([P1], { min: 3, max: 5 })?.code).toBe('facePhotos.tooFew');
    expect(validateFacePhotos([P1, P2, P1, P2, P1, P2], { min: 1, max: 5 })?.code).toBe('facePhotos.tooMany');
    expect(validateFacePhotos([P1, P2], { min: 1, max: 5 })).toBeNull();
  });
});
