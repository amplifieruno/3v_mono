import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import {
  CONSENT_RECORD_RESOURCE,
  PROFILE_DOCUMENT_RESOURCE,
  PROFILE_DUPLICATE_RESOURCE,
  PROFILE_RESOURCE,
} from '../../data/resource-names';
import type { ConsoleModule } from '../module';
import { consentRecord, consentRecordFields } from './consent-record';
import { uploadProfileDocument, uploadProfileDocumentOperation } from './document-upload';
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
 * processing, and the review queue of possible duplicate profiles. Later tasks add identities
 * and visits.
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
  },
  operations: [
    profileActivityOperation,
    profilePairOperation,
    uploadProfileDocumentOperation,
    setProcessingRestrictionOperation,
    mergeProfilesOperation,
  ],
} as const satisfies ConsoleModule;
