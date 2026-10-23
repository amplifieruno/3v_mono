import { defineResource } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { AUTHENTICATION_ATTEMPT_RESOURCE } from '../../data/resource-names';
import { recordDate } from '../people/record-date';
import { AUTHENTICATION_ATTEMPT_COLUMNS, AUTH_LOG_PAGE_SIZE, authenticationAttemptFields } from './attempt-fields';
import { approveAttemptFlow, rejectAttemptFlow } from './review-flows';

/** The review queue: partial matches waiting for an administrator (the saved view and the dev test). */
export const REVIEW_QUEUE_FILTERS = [
  { field: 'review_status', op: 'eq', value: 'pending' },
  { field: 'outcome', op: 'eq', value: 'partial_match' },
] as const;

/**
 * Authentication attempts (`itap.authentication_attempts`): each capture or second factor of a
 * session and how the engine decided it, newest first: outcome, failure reason, confidence against
 * the threshold used, population size, latency and, for a capture that did not succeed, one
 * evidence frame (opened through the audited `open_file`). Written by the engine only, an
 * append-only log (keyset paging, no count on every page). The review queue is the saved view
 * "Waiting for review": a pending partial match is approved or rejected with a note, which closes
 * its session and raises the authentication event.
 */
export const authenticationAttempt = defineResource(AUTHENTICATION_ATTEMPT_RESOURCE, {
  texts: {
    label: 'Authentication attempt',
    labelPlural: 'Authentication attempts',
    doc: {
      summary:
        'One capture of a face authentication session and its decision: success, partial match or failure, with the confidence, the threshold used and why. Never changed, except by the review of a partial match.',
    },
  },
  basePath: '/authentication-attempts',
  section: NAV_SECTIONS.faceAuth,
  order: 30,
  icon: NAV_ICONS.authAttempts,
  displayField: 'attempted_at',
  recordTitle: (record) => recordDate('Authentication attempt at', record.attempted_at),
  data: { provider: 'hasura' },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: authenticationAttemptFields,
  actions: (r) => ({ item: [r.action.flow('approve', approveAttemptFlow), r.action.flow('reject', rejectAttemptFlow)] }),
  views: {
    list: {
      columns: [...AUTHENTICATION_ATTEMPT_COLUMNS],
      optionalColumns: ['session_id', 'step', 'attack_outcome', 'population_size', 'latency_ms', 'matched_identity_id', 'profile_id', 'access_point_id'],
      defaultSort: [{ field: 'attempted_at', direction: 'desc' }],
      sortTiebreaker: 'id',
      pagination: 'cursor',
      count: 'manual',
      pageSize: AUTH_LOG_PAGE_SIZE,
      filters: {
        pinned: ['outcome', 'review_status', 'application_id', 'attempted_at'],
        fields: ['outcome', 'review_status', 'failure_reason', 'attack_outcome', 'application_id', 'mode', 'step', 'profile_id', 'access_point_id', 'attempted_at'],
      },
      savedViews: [
        { id: 'review-queue', texts: 'Waiting for review', state: { filters: [...REVIEW_QUEUE_FILTERS] } },
        { id: 'failures', texts: 'Failures', state: { filters: [{ field: 'outcome', op: 'eq', value: 'failure' }] } },
        { id: 'partial', texts: 'Partial matches', state: { filters: [{ field: 'outcome', op: 'eq', value: 'partial_match' }] } },
        {
          id: 'attacks',
          texts: 'Attacks detected',
          state: { filters: [{ field: 'failure_reason', op: 'eq', value: 'attack_detected' }] },
        },
        { id: 'reviewed', texts: 'Reviewed', state: { filters: [{ field: 'review_status', op: 'in', value: ['approved', 'rejected'] }] } },
      ],
    },
    show: {
      header: (l) => [l.grid(['attempted_at', 'application_id', 'outcome', 'review_status'])],
      body: (l) => [
        l.tabs(
          [
            l.panel(
              [
                l.grid(['confidence', 'threshold_used', 'population_size']),
                l.grid(['failure_reason', 'attack_outcome', 'latency_ms']),
                l.grid(['matched_identity_id', 'profile_id', 'claimed_identity_id']),
                l.grid(['session_id', 'attempt_no', 'step', 'mode']),
                'evidence_file_id',
              ],
              { key: 'decision', texts: 'Decision' },
            ),
            l.panel([l.grid(['reviewed_by', 'reviewed_at']), 'review_note'], { key: 'review', texts: 'Review' }),
            l.panel(
              [
                l.grid(['retrieval_candidates', 'retrieval_hit', 'comparison_score']),
                l.grid(['retrieval_ms', 'comparison_ms', 'model_version']),
                l.grid(['access_point_id', 'device_ref', 'ip']),
              ],
              { key: 'details', texts: 'Details' },
            ),
          ],
          { key: 'sections' },
        ),
      ],
    },
  },
});
