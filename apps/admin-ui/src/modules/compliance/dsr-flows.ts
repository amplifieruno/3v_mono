import { type FlowConfig, type FlowUnknownCheck, cond, ref } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { DSR_RESOURCE } from '../../data/resource-names';
import { fieldApplied } from '../../data/status-applied';
import { DSR_OPEN_STATUSES } from '../../enums/compliance-records';
import { checkNotBlank } from '../../fields/not-blank';
import { completeDataSubjectRequest, rejectDataSubjectRequest, retryDataSubjectRequest } from './dsr-ops';

const isOpen = cond.in(ref('record', 'status'), [...DSR_OPEN_STATUSES]);
const surfaces = { default: 'menu', show: 'auto' } as const;

const rejectFields = {
  reason: f.text({
    required: true,
    validate: checkNotBlank<string>(),
    texts: {
      label: 'Reason',
      doc: { summary: 'Why the request is not fulfilled, as the person is told, such as "Identity could not be verified" or "Manifestly unfounded (Art. 12(5))".' },
    },
  }),
};

/** "Reject" on an open request (`reject_dsr`): closed with the reason, audited; the job stops working on it. */
export const rejectDsrFlow = {
  texts: {
    label: 'Reject',
    notify: 'The request is rejected.',
    doc: { summary: 'Closes an open request without fulfilling it, with the reason the person is told. The rejection is audited.' },
  },
  icon: NAV_ICONS.rejectRequest,
  variant: 'destructive',
  surfaces,
  when: isOpen,
  form: { fields: rejectFields },
  submit: {
    mutation: rejectDataSubjectRequest,
    retry: 'never',
    input: { requestId: ref('record', 'id'), reason: ref('values', 'reason') },
    onUnknown: { check: fieldApplied(DSR_RESOURCE, 'status', 'rejected') },
  },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, typeof rejectFields>;

const completeFields = {
  outcome: f.text({
    required: true,
    validate: checkNotBlank<string>(),
    texts: {
      label: 'What was corrected',
      doc: { summary: 'The correction made, such as "Job title changed to Senior Facilities Coordinator on the profile". Audited as the rectification.' },
    },
  }),
};

/**
 * "Complete" on a rectification the job handed over (`complete_dsr`): after the member corrected
 * the person's profile, the request closes with what was corrected.
 */
export const completeDsrFlow = {
  texts: {
    label: 'Complete',
    notify: 'The rectification is completed.',
    doc: { summary: 'Closes a rectification once the profile is corrected, recording what was corrected (audited).' },
  },
  icon: NAV_ICONS.completeRequest,
  surfaces,
  when: cond.all([cond.equals(ref('record', 'request_type'), 'rectification'), cond.equals(ref('record', 'status'), 'in_progress')]),
  form: { fields: completeFields },
  submit: {
    mutation: completeDataSubjectRequest,
    retry: 'never',
    input: { requestId: ref('record', 'id'), outcome: ref('values', 'outcome') },
    onUnknown: { check: fieldApplied(DSR_RESOURCE, 'status', 'completed') },
  },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, typeof completeFields>;

/** Applied when the job is no longer stopped on `max_attempts` (requeued by this call or another). */
export const dsrRetryApplied: FlowUnknownCheck = async ({ record, data }) => {
  const id = record?.id;
  if (typeof id !== 'string' || id === '') return 'unknown';
  try {
    const { data: row } = await data.one(resourceByName(DSR_RESOURCE) as never, { id } as never);
    const now = row as Readonly<Record<string, unknown>> | null | undefined;
    if (now === null || now === undefined) return 'unknown';
    return now.last_error === 'max_attempts' && now.status === 'in_progress' ? 'not-applied' : 'applied';
  } catch {
    return 'unknown';
  }
};

/** "Retry" on a request the job gave up on (`retry_dsr`): a fresh budget of 5 attempts, picked up within seconds. */
export const retryDsrFlow = {
  texts: {
    label: 'Retry',
    confirm: 'Try this request again? The background job picks it up within seconds with a fresh budget of 5 attempts.',
    notify: 'The request is queued again.',
    doc: { summary: 'Queues a request again after the background job gave up on it (5 failed attempts); fix the cause first, as the last error says.' },
  },
  icon: NAV_ICONS.retryRequest,
  surfaces: { default: 'menu', show: 'menu' },
  when: cond.all([cond.equals(ref('record', 'status'), 'in_progress'), cond.equals(ref('record', 'last_error'), 'max_attempts')]),
  confirm: true,
  submit: {
    mutation: retryDataSubjectRequest,
    retry: 'never',
    input: { requestId: ref('record', 'id') },
    onUnknown: { check: dsrRetryApplied },
  },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;
