import { defineEnum } from '@burojs/core';
import { enumValues } from './values';

/* Compliance records (data subject requests, processing activities); values are the rows of the Hasura enum tables. */

export const DSR_TYPE_ENUM = 'dsr_type';
export const DSR_STATUS_ENUM = 'dsr_status';
export const DPIA_STATUS_ENUM = 'dpia_status';
export const LEGAL_BASIS_ENUM = 'legal_basis';

export const DSR_TYPES = ['access', 'portability', 'erasure', 'restriction', 'rectification'] as const;
export type DsrType = (typeof DSR_TYPES)[number];

export const DSR_STATUSES = ['received', 'in_progress', 'completed', 'rejected'] as const;
/** Statuses the job (or org_admin) still moves a request on from. */
export const DSR_OPEN_STATUSES = ['received', 'in_progress'] as const;

export const DPIA_STATUSES = ['not_required', 'required', 'in_progress', 'approved'] as const;

export const LEGAL_BASES = ['consent', 'contract', 'legal_obligation', 'vital_interests', 'public_task', 'legitimate_interests'] as const;

const text = (label: string, summary: string) => ({ label, doc: { summary } });

export const dsrTypeEnum = defineEnum({
  name: DSR_TYPE_ENUM,
  values: enumValues(DSR_TYPES, { access: 'info', portability: 'info', erasure: 'destructive', restriction: 'warning', rectification: 'secondary' }),
  texts: {
    access: text('Access', 'The person receives a copy of their data (GDPR Art. 15): a zip bundle prepared in the background.'),
    portability: text('Portability', 'The person receives their data in a machine-readable bundle to take elsewhere (GDPR Art. 20).'),
    erasure: text('Erasure', 'The person’s data is erased (GDPR Art. 17): irreversible; what a legal hold covers is kept and the request completes partially.'),
    restriction: text('Restriction', 'Processing of the person’s data is restricted (GDPR Art. 18) until a member lifts it on the profile.'),
    rectification: text('Rectification', 'Wrong data about the person is corrected (GDPR Art. 16) by a member, who then completes the request.'),
  },
});

export const dsrStatusEnum = defineEnum({
  name: DSR_STATUS_ENUM,
  values: enumValues(DSR_STATUSES, { received: 'secondary', in_progress: 'info', completed: 'success', rejected: 'destructive' }),
  texts: {
    received: text('Received', 'Filed and waiting for the background job, which picks it up within seconds.'),
    in_progress: text('In progress', 'Being fulfilled by the background job, or (rectification) waiting for a member to correct the data.'),
    completed: text('Completed', 'Fulfilled; an erasure kept under a legal hold is marked partial.'),
    rejected: text('Rejected', 'Closed without fulfilling it, with the reason.'),
  },
});

export const dpiaStatusEnum = defineEnum({
  name: DPIA_STATUS_ENUM,
  values: enumValues(DPIA_STATUSES, { not_required: 'secondary', required: 'warning', in_progress: 'info', approved: 'success' }),
  texts: {
    not_required: text('Not required', 'The processing is not likely to result in a high risk: no impact assessment (DPIA) is needed.'),
    required: text('Required', 'An impact assessment (DPIA) is needed and has not started.'),
    in_progress: text('In progress', 'The impact assessment (DPIA) is being written or reviewed.'),
    approved: text('Approved', 'The impact assessment (DPIA) is approved; its document is attached.'),
  },
});

export const legalBasisEnum = defineEnum({
  name: LEGAL_BASIS_ENUM,
  values: enumValues(LEGAL_BASES, {
    consent: 'info',
    contract: 'secondary',
    legal_obligation: 'secondary',
    vital_interests: 'warning',
    public_task: 'secondary',
    legitimate_interests: 'secondary',
  }),
  texts: {
    consent: text('Consent', 'The person agreed to the processing for this purpose (Art. 6(1)(a)); they can withdraw it.'),
    contract: text('Contract', 'Needed to perform a contract with the person, such as employment (Art. 6(1)(b)).'),
    legal_obligation: text('Legal obligation', 'Required by a law the organization is subject to (Art. 6(1)(c)).'),
    vital_interests: text('Vital interests', 'Needed to protect someone’s life (Art. 6(1)(d)).'),
    public_task: text('Public task', 'Needed for a task in the public interest or official authority (Art. 6(1)(e)).'),
    legitimate_interests: text('Legitimate interests', 'Needed for the organization’s legitimate interests, such as security, balanced against the person’s rights (Art. 6(1)(f)).'),
  },
});

export const COMPLIANCE_RECORD_ENUMS = [dsrTypeEnum, dsrStatusEnum, dpiaStatusEnum, legalBasisEnum] as const;

export const COMPLIANCE_RECORD_ENUM_TABLES: Readonly<Record<string, string>> = {
  [DSR_TYPE_ENUM]: 'dsr_types',
  [DSR_STATUS_ENUM]: 'dsr_statuses',
  [DPIA_STATUS_ENUM]: 'dpia_statuses',
  [LEGAL_BASIS_ENUM]: 'legal_bases',
};
