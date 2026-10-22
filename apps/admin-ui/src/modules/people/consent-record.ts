import { type Check, cond, defineResource, ref } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS } from '../../app/nav';
import { fieldApplied } from '../../data/status-applied';
import { CONSENT_RECORD_RESOURCE, PROFILE_RESOURCE } from '../../data/resource-names';
import { enumField } from '../../enums/field';
import {
  CONSENT_METHODS,
  CONSENT_METHOD_ENUM,
  CONSENT_PURPOSES,
  CONSENT_PURPOSE_ENUM,
  CONSENT_STATUSES,
  CONSENT_STATUS_ENUM,
} from '../../enums/people-records';
import { storageFile } from '../../fields/storage-file';
import { profile } from './profile';
import { PROFILE_DOCUMENT_FILE_KIND } from './profile-document';

/**
 * Columns of `itap.consent_records` the `org_admin` role reads (`organization_id` left out). A
 * record is one decision: it is created granted and withdrawn later through "Withdraw"; a new
 * grant is a new record (the latest biometric record decides).
 */
export const consentRecordFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  profile_id: f.relation({
    to: PROFILE_RESOURCE,
    required: true,
    write: 'create',
    open: 'page',
    texts: { label: 'Person', doc: { summary: 'The profile the consent was given for.' } },
  }),
  purpose: enumField(CONSENT_PURPOSES, CONSENT_PURPOSE_ENUM, {
    required: true,
    write: 'create',
    texts: {
      label: 'Purpose',
      doc: {
        summary:
          'What the person consented to. Biometric processing decides face matching: when its latest record is withdrawn, none of the person’s identities is matched.',
      },
    },
  }),
  status: enumField(CONSENT_STATUSES, CONSENT_STATUS_ENUM, {
    write: 'never',
    texts: {
      label: 'Status',
      doc: { summary: 'Granted when recorded; Withdrawn after "Withdraw". A new grant is recorded as a new consent.' },
    },
  }),
  method: enumField(CONSENT_METHODS, CONSENT_METHOD_ENUM, {
    required: true,
    default: 'electronic',
    texts: { label: 'Method', doc: { summary: 'How the consent was given: a paper form, an electronic form or verbally.' } },
  }),
  granted_at: f.dateTime({
    system: true,
    texts: { label: 'Granted', doc: { summary: 'When the consent was recorded.' } },
  }),
  withdrawn_at: f.dateTime({
    system: true,
    nullable: true,
    texts: { label: 'Withdrawn', doc: { summary: 'When the consent was withdrawn; empty while it stands.' } },
  }),
  document_file_id: storageFile({
    bucket: 'organization',
    kind: PROFILE_DOCUMENT_FILE_KIND,
    sensitive: true,
    displayOnly: true,
    texts: {
      label: 'Signed form',
      doc: {
        summary:
          'The signed consent form, when one was attached by an import. Upload a new signed form as a document of the profile.',
      },
    },
  }),
  notes: f.text({ nullable: true, texts: 'Notes' }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};

/** Refused before the request: an erased profile is a tombstone and records no new consent. */
export const consentOnErasedProfile: Check = {
  id: 'consentProfileErased',
  on: ['create'],
  severity: 'error',
  anchor: 'profile_id',
  texts: 'This person’s data was erased: no consent can be recorded for the profile.',
  when: async ({ values, data }) => {
    const id = values.profile_id;
    if (typeof id !== 'string' || id === '') return false;
    const { data: row } = await data.one(profile, { id });
    const erased = (row as { readonly erased_at?: unknown } | null)?.erased_at;
    return typeof erased === 'string' && erased !== '';
  },
};

const isBiometric = cond.equals(ref('record', 'purpose'), 'biometric_processing');

/**
 * Consent decisions of a person per purpose. Recorded from the profile's Consent tab and
 * withdrawn with "Withdraw"; never deleted (they are evidence). Withdrawing biometric consent
 * stops face matching for the person's identities at once; a later grant resumes it.
 */
export const consentRecord = defineResource(CONSENT_RECORD_RESOURCE, {
  texts: {
    label: 'Consent',
    labelPlural: 'Consents',
    doc: {
      summary:
        'A person’s consent to one purpose (biometric processing, tracking, analytics, marketing): when and how it was given, and whether it was withdrawn.',
    },
  },
  // Reached from a profile's Consent tab: no sidebar entry.
  basePath: '/consents',
  displayField: 'purpose',
  data: { provider: 'hasura' },
  prefill: { fromQuery: ['profile_id'] },
  operations: { delete: false },
  builtinActions: { delete: false },
  fields: consentRecordFields,
  checks: [consentOnErasedProfile],
  actions: (r) => ({
    item: [
      r.action.flow('withdraw', {
        texts: {
          label: 'Withdraw',
          confirm: 'Record that the person withdrew this consent? The record is kept, marked withdrawn.',
          notify: 'Consent withdrawn.',
          doc: {
            summary:
              'Records that the person withdrew the consent. For biometric processing, face matching stops for all of the person’s identities (their face templates are kept until the retention period deletes them); a new grant resumes it.',
          },
        },
        icon: NAV_ICONS.withdrawConsent,
        variant: 'destructive',
        surfaces: { default: 'menu', show: 'auto' },
        when: cond.equals(ref('record', 'status'), 'granted'),
        confirm: true,
        checks: [
          {
            id: 'biometricWithdrawal',
            severity: 'warning',
            when: isBiometric,
            texts:
              'Face matching stops at once for every identity linked to this person: cameras, face authentication and search no longer recognise them. Their face templates are deleted after the consent retention period unless consent is granted again.',
          },
        ],
        submit: {
          update: CONSENT_RECORD_RESOURCE,
          input: { status: 'withdrawn' },
          reread: { expect: cond.equals(ref('record', 'status'), 'granted') },
          onUnknown: { check: fieldApplied(CONSENT_RECORD_RESOURCE, 'status', 'withdrawn') },
        },
        then: { notify: true },
      }),
    ],
  }),
  views: {
    list: {
      columns: ['purpose', 'status', 'method', 'granted_at', 'withdrawn_at', 'profile_id'],
      defaultSort: [{ field: 'granted_at', direction: 'desc' }],
      filters: { fields: ['purpose', 'status', 'method'] },
    },
  },
});
