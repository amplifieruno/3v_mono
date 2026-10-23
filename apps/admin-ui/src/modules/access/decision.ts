import { defineResource } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { ACCESS_DECISION_RESOURCE } from '../../data/resource-names';
import { recordDate } from '../people/record-date';
import { accessDecisionFields } from './decision-fields';
import { decisionTraceBlock } from './decision-trace-block';

/** Page size of the decision lists (busy doors decide several times a minute). */
export const DECISION_PAGE_SIZE = 50;

/**
 * Access decisions (`itap.access_decisions`): every answer a door got from the access engine,
 * newest first. Written by the engine only, an append-only log: no create, edit or delete, no
 * count on every page (`count: 'manual'`, the mapping's `noAggregate`) and keyset paging. A
 * decision's page shows how the door decided as steps (the trace block), and links the person,
 * the door, and the policy version, grant or override that decided. The sidebar facility narrows
 * the list.
 */
export const accessDecision = defineResource(ACCESS_DECISION_RESOURCE, {
  texts: {
    label: 'Access decision',
    labelPlural: 'Access decisions',
    doc: {
      summary:
        'One answer of the access engine to a door: granted or denied, why, the risk score, and the trace of how it was decided. Never changed.',
    },
  },
  basePath: '/access-decisions',
  section: NAV_SECTIONS.access,
  order: 40,
  icon: NAV_ICONS.accessDecisions,
  displayField: 'decided_at',
  recordTitle: (record) => recordDate('Access decision at', record.decided_at),
  data: { provider: 'hasura', scope: { facility: { field: 'facility_id' } } },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: accessDecisionFields,
  views: {
    list: {
      columns: ['decided_at', 'result', 'reason', 'profile_id', 'access_point_id', 'risk_score'],
      optionalColumns: ['identity_id', 'facility_id', 'device_id', 'policy_version_id', 'grant_id', 'override_id'],
      defaultSort: [{ field: 'decided_at', direction: 'desc' }],
      sortTiebreaker: 'id',
      pagination: 'cursor',
      count: 'manual',
      pageSize: DECISION_PAGE_SIZE,
      filters: {
        pinned: ['result', 'reason', 'access_point_id', 'decided_at'],
        fields: ['result', 'reason', 'access_point_id', 'profile_id', 'identity_id', 'facility_id', 'decided_at', 'policy_version_id', 'grant_id', 'override_id'],
      },
      savedViews: [
        { id: 'denied', texts: 'Denied', state: { filters: [{ field: 'result', op: 'eq', value: 'denied' }] } },
        { id: 'granted', texts: 'Granted', state: { filters: [{ field: 'result', op: 'eq', value: 'granted' }] } },
        { id: 'by-grant', texts: 'Decided by a grant', state: { filters: [{ field: 'grant_id', op: 'isNotNull' }] } },
        { id: 'by-override', texts: 'Decided by an override', state: { filters: [{ field: 'override_id', op: 'isNotNull' }] } },
        { id: 'unknown-faces', texts: 'Unknown faces', state: { filters: [{ field: 'reason', op: 'eq', value: 'unknown_person' }] } },
      ],
    },
    show: {
      header: (l) => [l.grid(['decided_at', 'result', 'reason', 'risk_score'])],
      body: (l) => [
        l.tabs(
          [
            l.panel(
              [l.place(decisionTraceBlock, { key: 'decision-trace', props: { decisionId: l.ref('record', 'id') } })],
              { key: 'trace', texts: 'How it was decided' },
            ),
            l.panel(
              [
                l.grid(['profile_id', 'identity_id']),
                l.grid(['facility_id', 'access_point_id', 'device_id']),
                l.grid(['policy_version_id', 'grant_id', 'override_id']),
                l.grid(['detection_id', 'epoch', 'latency_ms']),
              ],
              { key: 'links', texts: 'Details' },
            ),
          ],
          { key: 'sections' },
        ),
      ],
    },
  },
});
