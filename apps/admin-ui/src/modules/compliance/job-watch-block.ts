import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';

/** The background jobs the block follows: an integration sync run or an export job. */
export const WATCHED_JOBS = ['sync_run', 'export_job'] as const;
export type WatchedJob = (typeof WATCHED_JOBS)[number];

/**
 * A sync run's or export job's progress while the background job works on it
 * (`itap:job-watch`): it reads the row's status again every few seconds while it is queued or
 * running, and once the status moved on from what the page shows, the page reads the row again
 * (counts, file, error follow; a record page does not poll its record, G61). Nothing is shown once
 * the job has ended. Props: which job, its id and the status the page read.
 */
export const jobWatchBlock = defineBlock('itap:job-watch', {
  texts: {
    label: 'Progress',
    queued: 'Queued: the background job picks it up within seconds.',
    running: 'Running…',
    live: 'Checking for progress every few seconds.',
    unreadable: 'The progress could not be read; reload the page to see where it stands.',
  },
  props: {
    job: prop(z.enum(WATCHED_JOBS)).default('sync_run'),
    id: prop(z.string().nullable().optional()).default(null),
    status: prop(z.string().nullable().optional()).default(null),
  },
});
