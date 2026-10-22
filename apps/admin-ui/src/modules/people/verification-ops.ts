import { defineMutation } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { IDENTITY_RESOURCE, VERIFICATION_REQUEST_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { sqlRefusals } from '../../data/sql-refusals';
import { PEOPLE_BINDING } from './profile-activity';

const NOTHING = ' Nothing was changed.';

export const decideVerificationInput = z.object({
  requestId: z.string().uuid(),
  reason: z.string().nullable().optional(),
});

/** The decided request as the functions return it. */
export const decidedRequest = z.object({ id: z.string(), status: z.string() });

/** The refusals both decisions share (`decide_verification`). */
const DECISION_REFUSALS = {
  verification_not_found: 'The request no longer exists.' + NOTHING,
  verification_not_pending: 'The request was already decided or cancelled.' + NOTHING,
  identity_already_merged:
    'The identity was merged into another one: its request can no longer be decided.' + NOTHING,
  identity_not_verifiable:
    'A suspended or archived identity cannot be verified: set it back to unverified first, or reject the request.' +
    NOTHING,
};

/** One decision function (`approve_verification` / `reject_verification`) as a custom operation. */
function decisionOperation(operation: string, field: string, document: string) {
  return hasuraOperation(
    PEOPLE_BINDING,
    operation,
    {
      kind: 'mutation',
      document: `mutation ${document}($request: uuid!, $reason: String) {
  ${field}(args: { p_request: $request, p_reason: $reason }) {
    id
    status
  }
}`,
      variables: (input) => {
        const { requestId, reason } = input as z.infer<typeof decideVerificationInput>;
        const text = reason?.trim() ?? '';
        return { request: requestId, reason: text === '' ? null : text };
      },
      mapResult: (data) => {
        const rows = rootOf(data, field);
        return Array.isArray(rows) ? (rows[0] ?? null) : null;
      },
    },
    sqlRefusals(DECISION_REFUSALS),
  );
}

/** `approve_verification(hasura_session, p_request, p_reason)` (org_admin). */
export const approveVerificationOperation = decisionOperation(
  'approveVerification',
  'approve_verification',
  'ApproveVerification',
);

/** `reject_verification(hasura_session, p_request, p_reason)` (org_admin). */
export const rejectVerificationOperation = decisionOperation(
  'rejectVerification',
  'reject_verification',
  'RejectVerification',
);

const effects = [{ resource: VERIFICATION_REQUEST_RESOURCE }, { resource: IDENTITY_RESOURCE }];

/** Approves a pending request: the identity becomes `verified`; the decider and time are recorded. */
export const approveVerification = defineMutation('itap:approve-verification', {
  binding: approveVerificationOperation.binding,
  input: schema(decideVerificationInput),
  output: schema(decidedRequest.nullable()),
  effects,
});

/** Rejects a pending request with the reason: the identity goes back to `unverified`. */
export const rejectVerification = defineMutation('itap:reject-verification', {
  binding: rejectVerificationOperation.binding,
  input: schema(decideVerificationInput),
  output: schema(decidedRequest.nullable()),
  effects,
});
