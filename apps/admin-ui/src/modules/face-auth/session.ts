import { defineResource, relatedList } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { AUTHENTICATION_ATTEMPT_RESOURCE, AUTHENTICATION_SESSION_RESOURCE } from '../../data/resource-names';
import { recordDate } from '../people/record-date';
import { AUTH_LOG_PAGE_SIZE } from './attempt-fields';
import { AUTHENTICATION_SESSION_COLUMNS, authenticationSessionFields } from './session-fields';

/**
 * Authentication sessions (`itap.authentication_sessions`): one per authentication a client
 * application started (or a console test), with its mode, its status and how many captures it
 * took; its attempts are listed on its page. Written by the face authentication service only, an
 * append-only log: no create, edit or delete, keyset paging without a count on every page.
 */
export const authenticationSession = defineResource(AUTHENTICATION_SESSION_RESOURCE, {
  texts: {
    label: 'Authentication session',
    labelPlural: 'Authentication sessions',
    doc: {
      summary:
        'One face authentication from start to end: opened by a client application, then one or more captures (attempts) until it succeeds, fails, waits for a review or expires.',
    },
  },
  basePath: '/authentication-sessions',
  section: NAV_SECTIONS.faceAuth,
  order: 20,
  icon: NAV_ICONS.authSessions,
  displayField: 'created_at',
  recordTitle: (record) => recordDate('Authentication session at', record.created_at),
  data: { provider: 'hasura' },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: authenticationSessionFields,
  views: {
    list: {
      columns: [...AUTHENTICATION_SESSION_COLUMNS],
      optionalColumns: ['claimed_identity_id', 'access_point_id', 'recapture_count', 'device_ref', 'expires_at'],
      defaultSort: [{ field: 'created_at', direction: 'desc' }],
      sortTiebreaker: 'id',
      pagination: 'cursor',
      count: 'manual',
      pageSize: AUTH_LOG_PAGE_SIZE,
      filters: {
        pinned: ['status', 'application_id', 'mode', 'created_at'],
        fields: ['status', 'application_id', 'mode', 'access_point_id', 'claimed_identity_id', 'created_at', 'closed_at'],
      },
      savedViews: [
        { id: 'review', texts: 'Waiting for review', state: { filters: [{ field: 'status', op: 'eq', value: 'review' }] } },
        { id: 'failed', texts: 'Failed', state: { filters: [{ field: 'status', op: 'eq', value: 'failed' }] } },
        { id: 'succeeded', texts: 'Succeeded', state: { filters: [{ field: 'status', op: 'eq', value: 'succeeded' }] } },
      ],
    },
    show: {
      header: (l) => [l.grid(['created_at', 'application_id', 'mode', 'status'])],
      body: (l) => [
        l.tabs(
          [
            l.panel(
              [
                l.place(relatedList(resourceByName(AUTHENTICATION_ATTEMPT_RESOURCE)), {
                  key: 'session-attempts',
                  props: {
                    where: [{ field: 'session_id', op: 'eq', value: l.ref('record', 'id') }],
                    columns: ['attempt_no', 'attempted_at', 'step', 'outcome', 'failure_reason', 'confidence', 'threshold_used', 'review_status'],
                    open: 'page',
                  },
                }),
              ],
              { key: 'attempts', texts: 'Attempts' },
            ),
            l.panel(
              [
                l.grid(['step', 'step_count', 'recapture_count']),
                l.grid(['claimed_identity_id', 'access_point_id']),
                l.grid(['expires_at', 'closed_at']),
                l.grid(['key_id', 'device_ref']),
                l.grid(['created_ip', 'user_agent']),
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
