import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { type HasuraOperationEntry, hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { EXPORT_JOB_RESOURCE, INTEGRATION_SYNC_RUN_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { WATCHED_JOBS, type WatchedJob } from './job-watch-block';
import { COMPLIANCE_BINDING } from './retention-policy-ops';

/** The table root of each watched job. */
const ROOTS: Readonly<Record<WatchedJob, string>> = { sync_run: 'integration_sync_runs_by_pk', export_job: 'export_jobs_by_pk' };

/** The resource a watched job's page shows (read again when the status moved on). */
export const JOB_RESOURCES: Readonly<Record<WatchedJob, string>> = { sync_run: INTEGRATION_SYNC_RUN_RESOURCE, export_job: EXPORT_JOB_RESOURCE };

const jobInput = z.object({ job: z.enum(WATCHED_JOBS), id: z.string().uuid() });
const jobStatus = z.object({ id: z.string(), status: z.string() });

/** Statuses a watched job still moves on from by itself. */
export const PENDING_JOB_STATUSES: ReadonlySet<string> = new Set(['queued', 'running']);

export const jobStatusOperation: HasuraOperationEntry = hasuraOperation(COMPLIANCE_BINDING, 'jobStatus', {
  kind: 'query',
  document: `query JobStatus($id: uuid!, $sync: Boolean!, $export: Boolean!) {
  integration_sync_runs_by_pk(id: $id) @include(if: $sync) { id status }
  export_jobs_by_pk(id: $id) @include(if: $export) { id status }
}`,
  variables: (input) => {
    const { job, id } = input as z.infer<typeof jobInput>;
    return { id, sync: job === 'sync_run', export: job === 'export_job' };
  },
  // Only the requested root is selected (`@include`), so the answer holds one of them.
  mapResult: (data) => {
    const row = jobStatus.safeParse(rootOf(data, ROOTS.sync_run) ?? rootOf(data, ROOTS.export_job));
    return row.success ? row.data : null;
  },
});

/** One sync run's or export job's status (`itap:job-watch`). */
export const jobStatusQuery = defineQuery('itap:job-status', {
  binding: jobStatusOperation.binding,
  input: schema(jobInput),
  output: schema(jobStatus.nullable()),
  reads: [resourceByName(INTEGRATION_SYNC_RUN_RESOURCE), resourceByName(EXPORT_JOB_RESOURCE)],
});
