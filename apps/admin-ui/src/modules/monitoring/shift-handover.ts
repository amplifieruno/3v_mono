import { defineResource, relatedList } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import {
  SHIFT_HANDOVER_INCIDENT_HISTORY_RESOURCE,
  SHIFT_HANDOVER_INCIDENT_RESOURCE,
  SHIFT_HANDOVER_RESOURCE,
} from '../../data/resource-names';
import { recordDate } from '../people/record-date';
import { SHIFT_HANDOVER_CHECKS, SHIFT_HANDOVER_SAVED_VIEWS, shiftHandoverFields } from './shift-handover-fields';
import { SHIFT_HANDOVER_RULES, acknowledgeHandoverFlow, addOpenIncidentsFlow } from './shift-handover-flows';
import { HANDOVER_INCIDENT_COLUMNS } from './shift-handover-incidents';

export { shiftHandoverFields };

/**
 * Shift handovers (`itap.shift_handovers`): the operator ending a shift writes what the next one
 * needs to know, names who takes over and passes on the incidents still being handled ("Add open
 * incidents", or one by one). The recipient acknowledges it; from then on it is the shift's
 * record and nothing about it changes. The incident list shows each incident's status now.
 */
export const shiftHandover = defineResource(SHIFT_HANDOVER_RESOURCE, {
  texts: {
    label: 'Shift handover',
    labelPlural: 'Shift handovers',
    doc: {
      summary:
        'What one operator passes on to the next at the end of a shift: a summary and the incidents still open, acknowledged by the operator taking over.',
    },
  },
  basePath: '/shift-handovers',
  section: NAV_SECTIONS.monitoring,
  order: 4,
  icon: NAV_ICONS.shiftHandovers,
  displayField: 'shift_started_at',
  recordTitle: (record) => recordDate('Handover of the shift from', record.shift_started_at),
  data: { provider: 'hasura' },
  fields: shiftHandoverFields,
  checks: SHIFT_HANDOVER_CHECKS,
  rules: SHIFT_HANDOVER_RULES,
  actions: (r) => ({
    item: [r.action.flow('acknowledge', acknowledgeHandoverFlow), r.action.flow('add_open_incidents', addOpenIncidentsFlow)],
  }),
  views: {
    list: {
      columns: ['created_at', 'from_user_id', 'to_user_id', 'shift_started_at', 'shift_ended_at', 'acknowledged_at'],
      defaultSort: [{ field: 'created_at', direction: 'desc' }],
      search: { fields: [{ field: 'summary', op: 'contains' }] },
      filters: {
        pinned: ['addressed_to_me', 'acknowledged_at'],
        fields: ['addressed_to_me', 'sent_by_me', 'from_user_id', 'to_user_id', 'acknowledged_at', 'shift_started_at', 'created_at'],
      },
      savedViews: SHIFT_HANDOVER_SAVED_VIEWS,
    },
    show: {
      header: (l) => [l.grid(['from_user_id', 'to_user_id', 'acknowledged_at'])],
      body: (l) => {
        // The sender changes the incident list until the recipient acknowledges; everyone else reads it.
        const editable = l.all([l.not(l.present(l.ref('record', 'acknowledged_at'))), l.equals(l.ref('record', 'sent_by_me'), true)]);
        const byHandover = [{ field: 'handover_id', op: 'eq', value: l.ref('record', 'id') }] as const;
        const incidents = (key: string, name: string) =>
          l.place(relatedList(resourceByName(name)), {
            key,
            props: { where: [...byHandover], columns: [...HANDOVER_INCIDENT_COLUMNS], open: 'none' },
          });
        return [
          l.grid(['shift_started_at', 'shift_ended_at', 'created_at']),
          'summary',
          l.panel(
            [
              l.panel([incidents('handover-incidents-open', SHIFT_HANDOVER_INCIDENT_RESOURCE)], { key: 'incidents-editable', when: editable }),
              l.panel([incidents('handover-incidents-frozen', SHIFT_HANDOVER_INCIDENT_HISTORY_RESOURCE)], {
                key: 'incidents-frozen',
                when: l.not(editable),
              }),
            ],
            {
              key: 'incidents',
              texts: {
                title: 'Incidents handed over',
                description: 'Each incident with its status now: what the next operator takes over.',
              },
            },
          ),
          'updated_at',
        ];
      },
    },
    create: { body: (l) => [l.grid(['to_user_id']), l.grid(['shift_started_at', 'shift_ended_at']), 'summary'] },
    edit: { body: (l) => [l.grid(['to_user_id']), l.grid(['shift_started_at', 'shift_ended_at']), 'summary'] },
  },
});
