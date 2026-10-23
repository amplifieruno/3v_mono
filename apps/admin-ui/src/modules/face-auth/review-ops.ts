import { defineMutation } from '@burojs/core';
import { z } from 'zod';
import { type HasuraOperationEntry, hasuraOperation, rootOf } from '../../data/operations';
import { AUTHENTICATION_ATTEMPT_RESOURCE, AUTHENTICATION_SESSION_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { type SqlRefusalText, sqlRefusals } from '../../data/sql-refusals';
import { FACE_AUTH_BINDING } from './application-ops';

const NOTHING = ' Nothing was changed.';

/** What `review_authentication_attempt` raises. */
export const REVIEW_REFUSALS: Readonly<Record<string, SqlRefusalText>> = {
  auth_attempt_not_found: 'The attempt no longer exists (or is not visible to you).' + NOTHING,
  auth_attempt_not_pending: 'The attempt is not waiting for a review any more: someone already approved or rejected it.' + NOTHING,
  auth_attempt_no_match: 'The attempt matched no identity, so there is nobody to approve or reject.' + NOTHING,
  auth_review_decision_required: 'Choose to approve or to reject the attempt.' + NOTHING,
  member_required: 'Only an active member of the organization can review attempts (your membership is suspended or expired).' + NOTHING,
};

export const reviewAttemptInput = z.object({
  attemptId: z.string().uuid(),
  approve: z.boolean(),
  note: z.string().nullable().optional(),
});

/** The reviewed attempt as the function returns it. */
export const reviewedAttempt = z.object({
  id: z.string(),
  review_status: z.string(),
  reviewed_at: z.string().nullable(),
  session_id: z.string().nullable(),
});

export const reviewAttemptOperation: HasuraOperationEntry = hasuraOperation(
  FACE_AUTH_BINDING,
  'reviewAuthenticationAttempt',
  {
    kind: 'mutation',
    document: `mutation ReviewAuthenticationAttempt($attempt: uuid!, $approve: Boolean!, $note: String) {
  review_authentication_attempt(args: { p_attempt: $attempt, p_approve: $approve, p_note: $note }) { id review_status reviewed_at session_id }
}`,
    variables: (input) => {
      const { attemptId, approve, note } = input as z.infer<typeof reviewAttemptInput>;
      const text = note?.trim() ?? '';
      return { attempt: attemptId, approve, note: text === '' ? null : text };
    },
    mapResult: (data) => {
      const rows = rootOf(data, 'review_authentication_attempt');
      return Array.isArray(rows) ? (rows[0] ?? null) : null;
    },
  },
  sqlRefusals(REVIEW_REFUSALS),
);

/**
 * The tracked function `review_authentication_attempt` (org_admin): approves or rejects a pending
 * partial match with a note. In one transaction it records the reviewer, closes the session
 * (succeeded or failed) and raises the authentication event (none for a sandbox application).
 */
export const reviewAuthenticationAttempt = defineMutation('itap:review-authentication-attempt', {
  binding: reviewAttemptOperation.binding,
  input: schema(reviewAttemptInput),
  output: schema(reviewedAttempt.nullable()),
  effects: [{ resource: AUTHENTICATION_ATTEMPT_RESOURCE }, { resource: AUTHENTICATION_SESSION_RESOURCE }],
});
