import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import { photoGalleryBlock } from '../../blocks/photo-gallery/photo-gallery-block';
import { identityPhotos, identityPhotosOperation } from '../../blocks/photo-gallery/identity-photos-query';
import { identityTimelineBlock } from '../../blocks/identity-timeline/identity-timeline-block';
import {
  identityTimeline,
  identityTimelineOperation,
  placeNamesOperation,
  timelinePlaceNames,
} from '../../blocks/identity-timeline/identity-timeline-query';
import {
  CONSENT_RECORD_RESOURCE,
  IDENTITY_DUPLICATE_RESOURCE,
  IDENTITY_MERGE_RESOURCE,
  IDENTITY_MERGE_SOURCE_RESOURCE,
  IDENTITY_RELATIONSHIP_RESOURCE,
  IDENTITY_RESOURCE,
  PROFILE_DOCUMENT_RESOURCE,
  PROFILE_DUPLICATE_RESOURCE,
  PROFILE_RESOURCE,
  VERIFICATION_REQUEST_RESOURCE,
  VISIT_RESOURCE,
} from '../../data/resource-names';
import { identitySplitParts, splitPartsOperation } from '../../fields/split-photos-query';
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
import { identityDuplicate, identityDuplicateFields } from './identity-duplicate';
import { identityFields } from './identity-fields';
import { identityMerge, identityMergeFields } from './identity-merge';
import {
  mergeIdentities,
  mergeIdentitiesOperation,
  rollbackMerge,
  rollbackMergeOperation,
  splitIdentity,
  splitIdentityOperation,
} from './identity-merge-ops';
import { identityMergePreview, identityMergePreviewOperation } from './identity-merge-preview';
import { identityMergeReviewBlock } from './identity-merge-review-block';
import { identityMergeSource, identityMergeSourceFields } from './identity-merge-source';
import { identityRelationship, identityRelationshipFields } from './identity-relationship';
import { addIdentityRelationship, addRelationshipOperation } from './identity-relationship-ops';
import { identityRelationshipsBlock } from './identity-relationships-block';
import { identityRelationships, identityRelationshipsOperation } from './identity-relationships-query';
import { mergeRollbackPreview, mergeRollbackPreviewOperation } from './merge-rollback-preview';
import { mergeRollbackReviewBlock } from './merge-rollback-review-block';
import { mergeProfiles, mergeProfilesOperation } from './merge-profiles';
import { profile } from './profile';
import { profileActivity, profileActivityOperation } from './profile-activity';
import { profileCompareBlock } from './profile-compare-block';
import { profileDocument, profileDocumentFields } from './profile-document';
import { profileDuplicate, profileDuplicateFields } from './profile-duplicate';
import { profileFields } from './profile-fields';
import { profilePair, profilePairOperation } from './profile-pair';
import { setProcessingRestriction, setProcessingRestrictionOperation } from './restriction';
import {
  approveVerification,
  approveVerificationOperation,
  rejectVerification,
  rejectVerificationOperation,
} from './verification-ops';
import { verificationRequest, verificationRequestFields } from './verification-request';
import { visit } from './visit';
import { visitFields } from './visit-fields';
import {
  cancelVisit,
  cancelVisitOperation,
  checkInVisit,
  checkInVisitOperation,
  checkOutVisit,
  checkOutVisitOperation,
} from './visit-ops';

/**
 * People: the profiles of known people (employees, visitors, contractors, VIPs) with their
 * activity over the last 30 days, their documents and consent decisions, the restriction of
 * processing, and the review queue of possible duplicate profiles; identities (tracked faces)
 * with their photos, created and enrolled from uploaded or camera photos, and their governance:
 * merges and rollbacks, splits, the duplicate queue, verification requests, relationships and
 * the timeline; visits with check-in, check-out and cancelling.
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
    identityMerge,
    identityMergeSource,
    identityDuplicate,
    verificationRequest,
    identityRelationship,
    mergeIdentities,
    rollbackMerge,
    splitIdentity,
    approveVerification,
    rejectVerification,
    addIdentityRelationship,
    identityMergePreview,
    mergeRollbackPreview,
    identityRelationships,
    identityTimeline,
    timelinePlaceNames,
    identitySplitParts,
    identityMergeReviewBlock,
    mergeRollbackReviewBlock,
    identityRelationshipsBlock,
    identityTimelineBlock,
    visit,
    checkInVisit,
    checkOutVisit,
    cancelVisit,
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
    [IDENTITY_MERGE_RESOURCE]: hasuraTable('identity_merges', { selectFields: selectFieldsOf(identityMergeFields) }),
    [IDENTITY_MERGE_SOURCE_RESOURCE]: hasuraTable('identity_merge_sources', {
      selectFields: selectFieldsOf(identityMergeSourceFields),
    }),
    [IDENTITY_DUPLICATE_RESOURCE]: hasuraTable('identity_duplicate_candidates', {
      selectFields: selectFieldsOf(identityDuplicateFields),
    }),
    [VERIFICATION_REQUEST_RESOURCE]: hasuraTable('verification_requests', {
      selectFields: selectFieldsOf(verificationRequestFields),
    }),
    [IDENTITY_RELATIONSHIP_RESOURCE]: hasuraTable('identity_relationships', {
      selectFields: selectFieldsOf(identityRelationshipFields),
    }),
    [VISIT_RESOURCE]: hasuraTable('visits', { selectFields: selectFieldsOf(visitFields) }),
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
    mergeIdentitiesOperation,
    rollbackMergeOperation,
    splitIdentityOperation,
    approveVerificationOperation,
    rejectVerificationOperation,
    addRelationshipOperation,
    identityMergePreviewOperation,
    mergeRollbackPreviewOperation,
    identityRelationshipsOperation,
    identityTimelineOperation,
    placeNamesOperation,
    splitPartsOperation,
    checkInVisitOperation,
    checkOutVisitOperation,
    cancelVisitOperation,
  ],
} as const satisfies ConsoleModule;
