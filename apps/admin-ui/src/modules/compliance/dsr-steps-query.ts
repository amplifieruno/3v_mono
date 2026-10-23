import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { DSR_RESOURCE, LEGAL_HOLD_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { COMPLIANCE_BINDING } from './retention-policy-ops';

export const dsrStep = z.object({
  id: z.string(),
  step: z.string(),
  at: z.string(),
  details: z.record(z.string(), z.unknown()),
});

export type DsrStep = z.infer<typeof dsrStep>;

/** A request's progress: where it stands and every step the job and members wrote (`dsr_steps`, oldest first). */
export const dsrProgress = z.object({
  id: z.string(),
  status: z.string(),
  request_type: z.string(),
  partial: z.boolean(),
  lease_expires_at: z.string().nullable(),
  last_error: z.string().nullable(),
  steps: z.array(dsrStep),
});

export type DsrProgress = z.infer<typeof dsrProgress>;

/** Whether the job still moves the request on by itself (the page reads it again while so). */
export function dsrPending(progress: Pick<DsrProgress, 'status' | 'lease_expires_at'> | null | undefined): boolean {
  if (progress === null || progress === undefined) return false;
  return progress.status === 'received' || (progress.status === 'in_progress' && progress.lease_expires_at !== null);
}

/** What an erasure kept under legal holds: the categories and the holds, from its `retained` step. */
export function retainedOf(steps: readonly DsrStep[]): { readonly categories: string[]; readonly holdIds: string[] } | null {
  const step = [...steps].reverse().find((s) => s.step === 'retained');
  if (step === undefined) return null;
  const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);
  return { categories: strings(step.details.categories), holdIds: strings(step.details.hold_ids) };
}

export const dsrProgressOperation = hasuraOperation(COMPLIANCE_BINDING, 'dataSubjectRequestProgress', {
  kind: 'query',
  document: `query DataSubjectRequestProgress($id: uuid!) {
  data_subject_requests_by_pk(id: $id) {
    id status request_type partial lease_expires_at last_error
    steps(order_by: [{ at: asc }, { created_at: asc }]) { id step at details }
  }
}`,
  variables: (input) => ({ id: (input as { requestId: string }).requestId }),
  mapResult: (data) => {
    const parsed = dsrProgress.safeParse(rootOf(data, 'data_subject_requests_by_pk'));
    return parsed.success ? parsed.data : null;
  },
});

/** One request's progress and steps (`itap:dsr-steps`). */
export const dataSubjectRequestProgress = defineQuery('itap:data-subject-request-progress', {
  binding: dsrProgressOperation.binding,
  input: schema(z.object({ requestId: z.string().uuid() })),
  output: schema(dsrProgress.nullable()),
  reads: [resourceByName(DSR_RESOURCE)],
});

export const holdNamesOperation = hasuraOperation(COMPLIANCE_BINDING, 'legalHoldNames', {
  kind: 'query',
  document: `query LegalHoldNames($ids: [uuid!]!) {
  legal_holds(where: { id: { _in: $ids } }) { id name }
}`,
  variables: (input) => ({ ids: (input as { holdIds: string[] }).holdIds }),
  mapResult: (data) => {
    const parsed = z.array(z.object({ id: z.string(), name: z.string() })).safeParse(rootOf(data, 'legal_holds'));
    return Object.fromEntries((parsed.success ? parsed.data : []).map((hold) => [hold.id, hold.name]));
  },
});

/** The names of legal holds by id (the holds a partial erasure names). */
export const legalHoldNames = defineQuery('itap:legal-hold-names', {
  binding: holdNamesOperation.binding,
  input: schema(z.object({ holdIds: z.array(z.string().uuid()) })),
  output: schema(z.record(z.string(), z.string())),
  reads: [resourceByName(LEGAL_HOLD_RESOURCE)],
});
