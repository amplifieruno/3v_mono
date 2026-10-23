import { type FlowConfig, cond, ref } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS } from '../../app/nav';
import { AUTHENTICATION_ATTEMPT_RESOURCE } from '../../data/resource-names';
import { fieldApplied } from '../../data/status-applied';
import { reviewAuthenticationAttempt } from './review-ops';

/** Offered only on a partial match waiting for a review (`review_status = pending`). */
export const pendingPartialMatch = cond.all([
  cond.equals(ref('record', 'review_status'), 'pending'),
  cond.equals(ref('record', 'outcome'), 'partial_match'),
]);

const noteField = (summary: string) => ({
  note: f.textarea({ required: true, texts: { label: 'Note', doc: { summary } } }),
});

const approveFields = noteField(
  'How the person was confirmed (for example, badge checked by the guard); kept on the attempt and in the audit log.',
);
const rejectFields = noteField('Why the person was not accepted; kept on the attempt and in the audit log.');

/**
 * "Approve" on a pending partial match: the reviewer confirms the person with a note. The session
 * succeeds and closes, and the success event is raised (not for a sandbox application). It has a
 * form, so its answer stays on screen (not confirm-only, G72).
 */
export const approveAttemptFlow = {
  texts: {
    label: 'Approve',
    notify: 'Attempt approved: its session, if still open, has now succeeded, and a “Face sign-in” event was raised (none for a sandbox application).',
    doc: {
      summary:
        'Confirms the person of a partial match: the attempt is approved with your name and note, its session, if still open, succeeds and closes, and the authentication success event is raised.',
    },
  },
  icon: NAV_ICONS.approveAttempt,
  surfaces: { default: 'menu', show: 'auto' },
  when: pendingPartialMatch,
  form: { fields: approveFields, initial: { note: { kind: 'literal', value: '' } } },
  submit: {
    mutation: reviewAuthenticationAttempt,
    retry: 'never',
    input: { attemptId: ref('record', 'id'), approve: { kind: 'literal', value: true }, note: ref('values', 'note') },
    onUnknown: { check: fieldApplied(AUTHENTICATION_ATTEMPT_RESOURCE, 'review_status', 'approved') },
  },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, typeof approveFields>;

/**
 * "Reject" on a pending partial match: the reviewer refuses the person with a note. The session
 * fails and closes, and the failure event is raised (not for a sandbox application).
 */
export const rejectAttemptFlow = {
  texts: {
    label: 'Reject',
    notify: 'Attempt rejected: its session, if still open, has now failed, and a “Face sign-in failed” event was raised (none for a sandbox application).',
    doc: {
      summary:
        'Refuses the person of a partial match: the attempt is rejected with your name and note, its session, if still open, fails and closes, and the authentication failure event is raised.',
    },
  },
  icon: NAV_ICONS.rejectAttempt,
  variant: 'destructive',
  surfaces: { default: 'menu', show: 'auto' },
  when: pendingPartialMatch,
  form: { fields: rejectFields, initial: { note: { kind: 'literal', value: '' } } },
  submit: {
    mutation: reviewAuthenticationAttempt,
    retry: 'never',
    input: { attemptId: ref('record', 'id'), approve: { kind: 'literal', value: false }, note: ref('values', 'note') },
    onUnknown: { check: fieldApplied(AUTHENTICATION_ATTEMPT_RESOURCE, 'review_status', 'rejected') },
  },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, typeof rejectFields>;
