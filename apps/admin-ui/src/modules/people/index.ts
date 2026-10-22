import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import { photoGalleryBlock } from '../../blocks/photo-gallery/photo-gallery-block';
import { identityPhotos, identityPhotosOperation } from '../../blocks/photo-gallery/identity-photos-query';
import {
  CONSENT_RECORD_RESOURCE,
  IDENTITY_RESOURCE,
  PROFILE_DOCUMENT_RESOURCE,
  PROFILE_DUPLICATE_RESOURCE,
  PROFILE_RESOURCE,
} from '../../data/resource-names';
import type { ConsoleModule } from '../module';
import { consentRecord, consentRecordFields } from './consent-record';
import { uploadProfileDocument, uploadProfileDocumentOperation } from './document-upload';
import {
  addIdentityPhotos,
  addIdentityPhotosOperation,
  createIdentityFromPhotos,
  createIdentityFromPhotosOperation,
  enrollFace,
  enrollFaceOperation,
} from './enrollment';
import { enrollmentResultBlock } from './enrollment-result-block';
import { identity } from './identity';
import { identityFields } from './identity-fields';
import { mergeProfiles, mergeProfilesOperation } from './merge-profiles';
import { profile } from './profile';
import { profileActivity, profileActivityOperation } from './profile-activity';
import { profileCompareBlock } from './profile-compare-block';
import { profileDocument, profileDocumentFields } from './profile-document';
import { profileDuplicate, profileDuplicateFields } from './profile-duplicate';
import { profileFields } from './profile-fields';
import { profilePair, profilePairOperation } from './profile-pair';
import { setProcessingRestriction, setProcessingRestrictionOperation } from './restriction';

/**
 * People: the profiles of known people (employees, visitors, contractors, VIPs) with their
 * activity over the last 30 days, their documents and consent decisions, the restriction of
 * processing, and the review queue of possible duplicate profiles; identities (tracked faces)
 * with their photos, created and enrolled from uploaded or camera photos. Later tasks add the
 * identity governance screens and visits.
 */
export const peopleModule = {
  name: 'people-module',
  uses: [
    profile,
    profileDocument,
    consentRecord,
    profileDuplicate,
    profileActivity,
    profilePair,
    uploadProfileDocument,
    setProcessingRestriction,
    mergeProfiles,
    profileCompareBlock,
    identity,
    identityPhotos,
    createIdentityFromPhotos,
    addIdentityPhotos,
    enrollFace,
    enrollmentResultBlock,
    photoGalleryBlock,
  ],
  tables: {
    [PROFILE_RESOURCE]: hasuraTable('profiles', { selectFields: selectFieldsOf(profileFields) }),
    [PROFILE_DOCUMENT_RESOURCE]: hasuraTable('profile_documents', {
      selectFields: selectFieldsOf(profileDocumentFields),
    }),
    [CONSENT_RECORD_RESOURCE]: hasuraTable('consent_records', {
      selectFields: selectFieldsOf(consentRecordFields),
    }),
    [PROFILE_DUPLICATE_RESOURCE]: hasuraTable('profile_duplicate_candidates', {
      selectFields: selectFieldsOf(profileDuplicateFields),
    }),
    [IDENTITY_RESOURCE]: hasuraTable('identities', { selectFields: selectFieldsOf(identityFields) }),
  },
  operations: [
    profileActivityOperation,
    profilePairOperation,
    uploadProfileDocumentOperation,
    setProcessingRestrictionOperation,
    mergeProfilesOperation,
    identityPhotosOperation,
    createIdentityFromPhotosOperation,
    addIdentityPhotosOperation,
    enrollFaceOperation,
  ],
} as const satisfies ConsoleModule;
