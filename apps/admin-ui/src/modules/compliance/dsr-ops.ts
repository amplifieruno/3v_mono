import { defineMutation } from '@burojs/core';
import { z } from 'zod';
import { type HasuraOperationEntry, hasuraOperation, rootOf } from '../../data/operations';
import { DSR_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { type SqlRefusalText, sqlRefusals } from '../../data/sql-refusals';
import { DSR_TYPES } from '../../enums/compliance-records';
import { COMPLIANCE_BINDING } from './retention-policy-ops';

const NOT_FILED = ' Nothing was filed.';
const NOTHING = ' Nothing was changed.';
const MEMBER = 'Only an active member of the organization can close requests (your membership is suspended or expired).' + NOTHING;

/** What filing a request is refused with (`data_subject_requests_guard`, the table's CHECKs and keys). */
export const CREATE_DSR_REFUSALS: Readonly<Record<string, SqlRefusalText>> = {
  dsr_profile_required: 'Choose the person the request is about.' + NOT_FILED,
  dsr_received_in_future: 'A request cannot be received in the future.' + NOT_FILED,
  dsr_must_start_received: 'A new request starts as received, without an outcome.' + NOT_FILED,
  data_subject_requests_due_window: 'The due date must be after the receipt and at most 90 days after it.' + NOT_FILED,
  data_subject_requests_profile_fkey: 'The person no longer exists in this organization.' + NOT_FILED,
  data_subject_requests_details_object: 'The requested changes are refused.' + NOT_FILED,
};

/** What `reject_dsr` raises. */
export const REJECT_DSR_REFUSALS: Readonly<Record<string, SqlRefusalText>> = {
  dsr_not_found: 'The request no longer exists in this organization.' + NOTHING,
  dsr_closed: 'The request is already completed or rejected: reload it to see how it was closed.' + NOTHING,
  dsr_rejection_reason_required: 'Give the reason for the rejection.' + NOTHING,
  member_required: MEMBER,
};

/** What `complete_dsr` raises. */
export const COMPLETE_DSR_REFUSALS: Readonly<Record<string, SqlRefusalText>> = {
  dsr_not_found: 'The request no longer exists in this organization.' + NOTHING,
  dsr_complete_type: 'Only a rectification is completed by hand; the other requests are fulfilled by the background job.' + NOTHING,
  dsr_closed: 'The request is already completed or rejected: reload it to see how it was closed.' + NOTHING,
  dsr_not_in_progress: 'The background job has not picked the request up yet: wait a few seconds, then complete it.' + NOTHING,
  dsr_outcome_required: 'Say what was corrected.' + NOTHING,
  member_required: MEMBER,
};

/** What `retry_dsr` raises. */
export const RETRY_DSR_REFUSALS: Readonly<Record<string, SqlRefusalText>> = {
  dsr_not_found: 'The request no longer exists in this organization.' + NOTHING,
  dsr_not_failed: 'The background job has not given up on this request (it is still being worked on, or it is closed): reload it to see where it stands.' + NOTHING,
  member_required: MEMBER,
};

export const newDsrInput = z.object({
  profile_id: z.string().uuid(),
  request_type: z.enum(DSR_TYPES),
  received_at: z.string(),
  due_at: z.string(),
  notes: z.string().nullable(),
  details: z.record(z.string(), z.unknown()),
});

export type NewDsr = z.infer<typeof newDsrInput>;

const filedRow = z.object({ id: z.string(), code: z.string() });
const requestRow = z.object({ id: z.string(), status: z.string() });

/** Files a request; its insert starts the background job (`fulfil_dsr`). */
export const createDsrOperation: HasuraOperationEntry = hasuraOperation(
  COMPLIANCE_BINDING,
  'createDataSubjectRequest',
  {
    kind: 'mutation',
    document: `mutation CreateDataSubjectRequest($object: data_subject_requests_insert_input!) {
  insert_data_subject_requests_one(object: $object) { id code }
}`,
    variables: (input) => ({ object: input as NewDsr }),
    mapResult: (data) => rootOf(data, 'insert_data_subject_requests_one') ?? null,
  },
  sqlRefusals(CREATE_DSR_REFUSALS),
);

const firstRow = (data: unknown, root: string): unknown => {
  const rows = rootOf(data, root);
  return Array.isArray(rows) ? (rows[0] ?? null) : null;
};

export const rejectDsrOperation: HasuraOperationEntry = hasuraOperation(
  COMPLIANCE_BINDING,
  'rejectDataSubjectRequest',
  {
    kind: 'mutation',
    document: `mutation RejectDataSubjectRequest($request: uuid!, $reason: String!) {
  reject_dsr(args: { p_request: $request, p_reason: $reason }) { id status }
}`,
    variables: (input) => {
      const { requestId, reason } = input as { requestId: string; reason: string };
      return { request: requestId, reason };
    },
    mapResult: (data) => firstRow(data, 'reject_dsr'),
  },
  sqlRefusals(REJECT_DSR_REFUSALS),
);

export const completeDsrOperation: HasuraOperationEntry = hasuraOperation(
  COMPLIANCE_BINDING,
  'completeDataSubjectRequest',
  {
    kind: 'mutation',
    document: `mutation CompleteDataSubjectRequest($request: uuid!, $outcome: String!) {
  complete_dsr(args: { p_request: $request, p_outcome: $outcome }) { id status }
}`,
    variables: (input) => {
      const { requestId, outcome } = input as { requestId: string; outcome: string };
      return { request: requestId, outcome };
    },
    mapResult: (data) => firstRow(data, 'complete_dsr'),
  },
  sqlRefusals(COMPLETE_DSR_REFUSALS),
);

export const retryDsrOperation: HasuraOperationEntry = hasuraOperation(
  COMPLIANCE_BINDING,
  'retryDataSubjectRequest',
  {
    kind: 'mutation',
    document: `mutation RetryDataSubjectRequest($request: uuid!) {
  retry_dsr(args: { p_request: $request }) { id status }
}`,
    variables: (input) => ({ request: (input as { requestId: string }).requestId }),
    mapResult: (data) => firstRow(data, 'retry_dsr'),
  },
  sqlRefusals(RETRY_DSR_REFUSALS),
);

const effects = [{ resource: DSR_RESOURCE }];

/** Files a data subject request of one type (the "new request" flows). */
export const createDataSubjectRequest = defineMutation('itap:create-data-subject-request', {
  binding: createDsrOperation.binding,
  input: schema(newDsrInput),
  output: schema(filedRow.nullable()),
  effects,
});

/** Closes an open request as rejected, with the reason (audited). */
export const rejectDataSubjectRequest = defineMutation('itap:reject-data-subject-request', {
  binding: rejectDsrOperation.binding,
  input: schema(z.object({ requestId: z.string().uuid(), reason: z.string().trim().min(1) })),
  output: schema(requestRow.nullable()),
  effects,
});

/** Closes a rectification as completed, with what was corrected (audited as `rectify`). */
export const completeDataSubjectRequest = defineMutation('itap:complete-data-subject-request', {
  binding: completeDsrOperation.binding,
  input: schema(z.object({ requestId: z.string().uuid(), outcome: z.string().trim().min(1) })),
  output: schema(requestRow.nullable()),
  effects,
});

/** Queues a request the job gave up on again, with a fresh budget of attempts. */
export const retryDataSubjectRequest = defineMutation('itap:retry-data-subject-request', {
  binding: retryDsrOperation.binding,
  input: schema(z.object({ requestId: z.string().uuid() })),
  output: schema(requestRow.nullable()),
  effects,
});

export const DSR_OPERATIONS = [createDsrOperation, rejectDsrOperation, completeDsrOperation, retryDsrOperation] as const;
