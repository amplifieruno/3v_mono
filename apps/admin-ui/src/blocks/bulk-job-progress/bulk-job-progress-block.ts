import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';

/**
 * A bulk job's progress (`itap:bulk-job-progress`): rows read of the file's total as a bar, and the
 * rows succeeded, failed and skipped so far; once it ends, how the rows add up (with the rows a
 * cancelled job never reached). While the job is queued or running it reads the job again every few
 * seconds (for at most half an hour on one page), and when the job has moved on, the page's job and
 * rows are read again too. Props: the job's id and the status the page read.
 */
export const bulkJobProgressBlock = defineBlock('itap:bulk-job-progress', {
  texts: {
    label: 'Progress',
    waiting: 'Waiting for a worker to start the job…',
    reading: 'Reading the file…',
    rows: '{{processed}} of {{total}} rows read',
    succeeded: 'Succeeded',
    failed: 'Failed',
    skipped: 'Skipped',
    notReached: 'Not reached',
    sum: '{{total}} rows: {{succeeded}} succeeded, {{failed}} failed, {{skipped}} skipped',
    sumNotReached: '{{total}} rows: {{succeeded}} succeeded, {{failed}} failed, {{skipped}} skipped, {{notReached}} not reached',
    cancelled: 'Cancelled: the job stopped; rows applied before stay applied.',
    attempt: 'Attempt {{attempt}} of 3',
    live: 'Checking for progress every few seconds…',
    stale: 'Stopped checking after a while: reload the page to see where the job stands.',
    loading: 'Reading the job’s progress…',
    unreadable: 'The job’s progress could not be read.',
  },
  props: {
    jobId: prop(z.string().nullable().optional()).default(null),
    status: prop(z.string().nullable().optional()).default(null),
  },
});
