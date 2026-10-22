import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';

/**
 * A report's way from request to file (`itap:report-status`): requested, generating (with the attempt),
 * then completed, failed or expired, each with its time. While the report is queued or generating it
 * reads the report again every few seconds, and when it has moved on from what the page shows, the
 * page reads the report again too (its file, error and Retry follow). Props: the report's id and the
 * status the page read.
 */
export const reportStatusBlock = defineBlock('itap:report-status', {
  texts: {
    label: 'Progress',
    requested: 'Requested',
    generating: 'Generating',
    attempt: 'attempt {{attempt}} of {{max}}',
    waiting: 'waiting',
    completed: 'Completed',
    failed: 'Failed',
    expired: 'Expired',
    expiredNote: 'The file was removed by the retention policy.',
    live: 'Checking for progress every few seconds…',
    loading: 'Reading the report’s progress…',
    unreadable: 'The report’s progress could not be read.',
  },
  props: {
    reportId: prop(z.string().nullable().optional()).default(null),
    status: prop(z.string().nullable().optional()).default(null),
  },
});
