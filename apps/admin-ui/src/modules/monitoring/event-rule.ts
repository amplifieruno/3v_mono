import { type Rule, defineResource, relatedList } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import {
  EVENT_RESOURCE,
  EVENT_RULE_RESOURCE,
  EVENT_RULE_VERSION_RESOURCE,
  INCIDENT_RESOURCE,
} from '../../data/resource-names';
import { EVENT_COLUMNS } from './event';
import { editDraftFlow } from './event-rule-flows';
import { eventRuleFields } from './event-rule-fields';
import { VERSION_COLUMNS } from './event-rule-version';

/**
 * A rule that was ever in force is history (its versions name the events they raised): it is
 * disabled, not deleted. A rule never published can be deleted with its drafts.
 */
const RULE_RULES: Rule[] = [
  {
    target: { kind: 'action', name: 'delete' },
    deny: 'run',
    when: (ctx) => {
      const current = (ctx.record as { readonly current_version_id?: unknown } | undefined)?.current_version_id;
      return typeof current === 'string' && current !== '';
    },
    fallback: 'disable',
    reason: 'This rule has been in force: disable it instead, so its versions and the events they raised stay.',
  },
];

/**
 * Event rules (`itap.event_rules`): what makes an event matter: its severity, whether it opens an
 * incident, and where it applies, by rule type. The header holds the name, type and switch; the
 * behaviour lives in versions (`./event-rule-version.ts`): "Edit draft" opens the draft,
 * "Publish" on the draft puts it in force. The rule's page lists the versions, the incidents the
 * rule opened and the events of the version in force.
 */
export const eventRule = defineResource(EVENT_RULE_RESOURCE, {
  texts: {
    label: 'Event rule',
    labelPlural: 'Event rules',
    doc: {
      summary:
        'Decides which events matter: by rule type, where it applies, how severe the events are and whether they open incidents. Changed through versions: a draft is edited and published.',
    },
  },
  basePath: '/event-rules',
  section: NAV_SECTIONS.monitoring,
  order: 50,
  icon: NAV_ICONS.eventRules,
  displayField: 'name',
  data: { provider: 'hasura' },
  fields: eventRuleFields,
  rules: RULE_RULES,
  actions: (r) => ({ item: [r.action.flow('edit_draft', editDraftFlow)] }),
  views: {
    list: {
      columns: ['code', 'name', 'rule_type', 'is_enabled', 'current_version_id', 'last_triggered_at', 'trigger_count'],
      defaultSort: [{ field: 'name', direction: 'asc' }],
      search: { fields: ['code', { field: 'name', op: 'contains' }] },
      filters: { pinned: ['rule_type', 'is_enabled'], fields: ['rule_type', 'is_enabled', 'last_triggered_at'] },
      savedViews: [
        { id: 'enabled', texts: 'Enabled', state: { filters: [{ field: 'is_enabled', op: 'eq', value: true }] } },
        {
          id: 'never-published',
          texts: 'Never published',
          state: { filters: [{ field: 'current_version_id', op: 'isNull' }] },
        },
      ],
    },
    show: {
      header: (l) => [l.grid(['code', 'rule_type', 'is_enabled', 'current_version_id'])],
      body: (l) => [
        l.tabs(
          [
            l.panel(
              [
                'name',
                'description',
                l.grid(['last_triggered_at', 'trigger_count']),
                l.grid(['created_at', 'updated_at']),
              ],
              { key: 'details', texts: 'Details' },
            ),
            l.panel(
              [
                l.place(relatedList(resourceByName(EVENT_RULE_VERSION_RESOURCE)), {
                  key: 'rule-versions',
                  props: {
                    where: [{ field: 'rule_id', op: 'eq', value: l.ref('record', 'id') }],
                    columns: [...VERSION_COLUMNS],
                    open: 'page',
                  },
                }),
              ],
              { key: 'versions', texts: 'Versions' },
            ),
            l.panel(
              [
                l.place(relatedList(resourceByName(INCIDENT_RESOURCE)), {
                  key: 'rule-incidents',
                  props: {
                    where: [{ field: 'rule_id', op: 'eq', value: l.ref('record', 'id') }],
                    columns: ['code', 'title', 'severity', 'status', 'facility_id', 'created_at'],
                    open: 'page',
                  },
                }),
              ],
              { key: 'incidents', texts: 'Incidents' },
            ),
            l.panel(
              [
                l.place(relatedList(resourceByName(EVENT_RESOURCE)), {
                  key: 'rule-events',
                  props: {
                    where: [{ field: 'rule_version_id', op: 'eq', value: l.ref('record', 'current_version_id') }],
                    columns: [...EVENT_COLUMNS],
                    open: 'page',
                  },
                }),
              ],
              { key: 'events', texts: 'Events of the version in force' },
            ),
          ],
          { key: 'sections' },
        ),
      ],
    },
    create: {
      body: (l) => [l.grid(['name', 'rule_type']), 'description', 'is_enabled'],
    },
    edit: {
      header: (l) => [l.grid(['code', 'rule_type'])],
      body: () => ['name', 'description', 'is_enabled'],
    },
  },
});
