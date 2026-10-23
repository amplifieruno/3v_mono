import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';

/**
 * A data subject request's steps (`itap:dsr-steps`): every step the background job and the
 * members wrote, oldest first, with its time; a partial erasure first says what legal holds kept
 * and links the holds. While the job still works on the request it reads it again every few
 * seconds, and when the status moved on from what the page shows, the page reads the request
 * again too (status, bundle, actions follow). Props: the request's id and the status the page read.
 */
export const dsrStepsBlock = defineBlock('itap:dsr-steps', {
  texts: {
    label: 'Steps',
    loading: 'Reading the request’s steps…',
    unreadable: 'The request’s steps could not be read.',
    none: 'No step yet: the background job picks the request up within seconds.',
    live: 'Checking for progress every few seconds…',
    partialTitle: 'Partial erasure: kept under a legal hold',
    partialText: 'What a legal hold in force covered was kept; everything else was erased. Kept:',
    partialHolds: 'Kept by:',
    holdFallback: 'Legal hold',
    category_profile: 'Profile',
    category_identities: 'Identities',
    category_incidents: 'Incidents',
    step_claimed: 'Picked up by the background job (attempt {{attempt}})',
    step_failed: 'Attempt {{attempt}} failed: {{error}}; tried again later',
    step_gave_up: 'Gave up after {{attempts}} attempts: fix the cause, then Retry',
    step_requeued: 'Queued again by a member',
    step_restricted: 'Processing of the person restricted',
    step_awaiting_rectification: 'Waiting for the rectification: correct the profile, then Complete the request',
    step_export_uploaded: 'Bundle prepared ({{files}} files, {{missing}} missing)',
    step_purged: '{{dataClass}}: {{affected}} rows erased, {{files}} files queued',
    step_purged_held: '{{dataClass}}: {{affected}} rows erased, {{held}} kept by legal holds, {{files}} files queued',
    step_biometrics_deleted: 'Photos and face templates deleted; {{deleted}} identities deleted, {{kept}} kept',
    step_integration_suppressed: 'HR sync told not to bring the person back',
    step_profile_anonymized: 'Profile replaced by the "Erased subject" tombstone',
    step_files_queued: '{{files}} files queued for deletion (within about 10 minutes)',
    step_retained: 'Data kept under legal holds',
    step_overdue: 'Reported overdue',
    step_rejected: 'Rejected by a member',
    step_rejected_reason: 'Rejected: {{reason}}',
    step_completed: 'Completed',
    step_completed_partial: 'Completed partially (legal hold)',
    step_other: '{{step}}',
  },
  props: {
    requestId: prop(z.string().nullable().optional()).default(null),
    status: prop(z.string().nullable().optional()).default(null),
  },
});
