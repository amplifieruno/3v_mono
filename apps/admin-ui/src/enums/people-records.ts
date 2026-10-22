import { defineEnum } from '@burojs/core';
import { enumValues } from './values';

/*
 * Enums of the records kept about a person: documents, consent decisions and duplicate
 * candidates. Values are the rows of the Hasura enum tables in `PEOPLE_RECORD_ENUM_TABLES`,
 * except `MERGE_KEEP_ENUM`, a console-only choice (`CONSOLE_ONLY_ENUMS`).
 */

export const DOCUMENT_KIND_ENUM = 'profile_document_kind';

/** `profile_document_kinds`; the `upload_profile_document` action accepts exactly these. */
export const DOCUMENT_KINDS = ['id_card', 'contract', 'nda', 'badge_photo', 'other'] as const;

export const documentKindEnum = defineEnum({
  name: DOCUMENT_KIND_ENUM,
  values: enumValues(DOCUMENT_KINDS, {
    id_card: 'default',
    contract: 'info',
    nda: 'secondary',
    badge_photo: 'secondary',
    other: 'secondary',
  }),
  texts: {
    id_card: { label: 'Identity card', doc: { summary: 'An identity card or passport.' } },
    contract: { label: 'Contract', doc: { summary: 'An employment or service contract.' } },
    nda: { label: 'NDA', doc: { summary: 'A non-disclosure agreement.' } },
    badge_photo: { label: 'Badge photo', doc: { summary: 'The picture printed on the person’s badge.' } },
    other: 'Other',
  },
});

export const CONSENT_PURPOSE_ENUM = 'consent_purpose';

export const CONSENT_PURPOSES = ['biometric_processing', 'tracking', 'analytics', 'marketing'] as const;

export const consentPurposeEnum = defineEnum({
  name: CONSENT_PURPOSE_ENUM,
  values: enumValues(CONSENT_PURPOSES, {
    biometric_processing: 'warning',
    tracking: 'info',
    analytics: 'secondary',
    marketing: 'secondary',
  }),
  texts: {
    biometric_processing: {
      label: 'Biometric processing',
      doc: {
        summary:
          'Face recognition and the storage of face templates. Withdrawing it stops face matching for every identity linked to the person; granting it again resumes matching.',
      },
    },
    tracking: { label: 'Tracking', doc: { summary: 'Following the person’s movement between areas.' } },
    analytics: { label: 'Analytics', doc: { summary: 'Use of the person’s data in analytics and reports.' } },
    marketing: { label: 'Marketing', doc: { summary: 'Marketing communication to the person.' } },
  },
});

export const CONSENT_STATUS_ENUM = 'consent_status';

export const CONSENT_STATUSES = ['granted', 'withdrawn'] as const;

export const consentStatusEnum = defineEnum({
  name: CONSENT_STATUS_ENUM,
  values: enumValues(CONSENT_STATUSES, { granted: 'success', withdrawn: 'destructive' }),
  texts: {
    granted: { label: 'Granted', doc: { summary: 'The person gave this consent and has not withdrawn it.' } },
    withdrawn: {
      label: 'Withdrawn',
      doc: { summary: 'The person withdrew this consent; the record stays as evidence of both decisions.' },
    },
  },
});

export const CONSENT_METHOD_ENUM = 'consent_method';

export const CONSENT_METHODS = ['paper', 'electronic', 'verbal'] as const;

export const consentMethodEnum = defineEnum({
  name: CONSENT_METHOD_ENUM,
  values: enumValues(CONSENT_METHODS, { paper: 'secondary', electronic: 'secondary', verbal: 'secondary' }),
  texts: {
    paper: { label: 'Paper form', doc: { summary: 'A signed paper form.' } },
    electronic: { label: 'Electronic form', doc: { summary: 'An electronic form the person filled in.' } },
    verbal: { label: 'Verbal', doc: { summary: 'Said aloud and recorded by an operator.' } },
  },
});

export const CANDIDATE_STATUS_ENUM = 'candidate_status';

/** `candidate_statuses`, shared by the profile and the identity duplicate queues. */
export const CANDIDATE_STATUSES = ['open', 'merged', 'dismissed'] as const;

export const candidateStatusEnum = defineEnum({
  name: CANDIDATE_STATUS_ENUM,
  values: enumValues(CANDIDATE_STATUSES, { open: 'warning', merged: 'success', dismissed: 'secondary' }),
  texts: {
    open: { label: 'Open', doc: { summary: 'Waiting for someone to decide whether the two are the same.' } },
    merged: { label: 'Merged', doc: { summary: 'The two were merged; set by the merge itself.' } },
    dismissed: { label: 'Not a duplicate', doc: { summary: 'Someone decided the two are different.' } },
  },
});

export const MERGE_KEEP_ENUM = 'profile_merge_keep';

/** Which profile of a duplicate pair a merge keeps (the other is folded into it). */
export const MERGE_KEEP = ['first', 'second'] as const;

export const mergeKeepEnum = defineEnum({
  name: MERGE_KEEP_ENUM,
  values: enumValues(MERGE_KEEP, { first: 'default', second: 'default' }),
  texts: {
    first: { label: 'Keep the first profile', doc: { summary: 'The left column stays; the right one is merged into it.' } },
    second: {
      label: 'Keep the second profile',
      doc: { summary: 'The right column stays; the left one is merged into it.' },
    },
  },
});

/** Each enum above by the Hasura enum table (GraphQL `custom_name`) holding its values. */
export const PEOPLE_RECORD_ENUM_TABLES: Readonly<Record<string, string>> = {
  [DOCUMENT_KIND_ENUM]: 'profile_document_kinds',
  [CONSENT_PURPOSE_ENUM]: 'consent_purposes',
  [CONSENT_STATUS_ENUM]: 'consent_statuses',
  [CONSENT_METHOD_ENUM]: 'consent_methods',
  [CANDIDATE_STATUS_ENUM]: 'candidate_statuses',
};
