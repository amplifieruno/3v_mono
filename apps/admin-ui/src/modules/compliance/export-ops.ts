import { defineMutation } from '@burojs/core';
import { z } from 'zod';
import { type HasuraOperationEntry, hasuraOperation, rootOf } from '../../data/operations';
import { EXPORT_DEFINITION_RESOURCE, EXPORT_JOB_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { MEMBER_NOT_ACTIVE_REFUSAL, type SqlRefusalText, sqlRefusals } from '../../data/sql-refusals';
import { COMPLIANCE_BINDING } from './retention-policy-ops';

const NO_JOB = ' No job was started.';

/** What requesting a job is refused with (`export_jobs_prepare`). */
export const RUN_EXPORT_REFUSALS: Readonly<Record<string, SqlRefusalText>> = {
  export_definition_not_found: 'The export definition no longer exists.' + NO_JOB,
  export_owner_only: 'Only the definition’s owner can run it: its jobs read the data with the owner’s permissions.' + NO_JOB,
  export_job_active: 'A job of this definition is still queued or running: wait for it to finish (its Jobs tab shows it).' + NO_JOB,
  member_not_active: MEMBER_NOT_ACTIVE_REFUSAL,
};

export const runExportInput = z.object({ definitionId: z.string().uuid() });
const queuedJob = z.object({ id: z.string(), status: z.string() });

export const runExportOperation: HasuraOperationEntry = hasuraOperation(
  COMPLIANCE_BINDING,
  'runExport',
  {
    kind: 'mutation',
    document: `mutation RunExport($definition: uuid!) {
  insert_export_jobs_one(object: { definition_id: $definition }) { id status }
}`,
    variables: (input) => ({ definition: (input as z.infer<typeof runExportInput>).definitionId }),
    mapResult: (data) => rootOf(data, 'insert_export_jobs_one') ?? null,
  },
  sqlRefusals(RUN_EXPORT_REFUSALS),
);

/** "Run now": a manual job of the definition (as its owner); `run_export` writes the file. */
export const runExport = defineMutation('itap:run-export', {
  binding: runExportOperation.binding,
  input: schema(runExportInput),
  output: schema(queuedJob.nullable()),
  effects: [{ resource: EXPORT_JOB_RESOURCE }, { resource: EXPORT_DEFINITION_RESOURCE }],
});

export const EXPORT_OPERATIONS = [runExportOperation];
