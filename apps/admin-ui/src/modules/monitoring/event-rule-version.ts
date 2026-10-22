import { type Rule, defineResource, relatedList } from '@burojs/core';
import { resourceByName } from '../../data/resource-by-name';
import {
  EVENT_RESOURCE,
  EVENT_RULE_SCOPE_HISTORY_RESOURCE,
  EVENT_RULE_SCOPE_RESOURCE,
  EVENT_RULE_VERSION_RESOURCE,
} from '../../data/resource-names';
import { EVENT_COLUMNS } from './event';
import { OPEN_STATUSES, publishFlow, rollbackFlow } from './event-rule-flows';
import { eventRuleVersionFields } from './event-rule-version-fields';

/** The columns of a rule's version history. */
export const VERSION_COLUMNS = ['version', 'status', 'severity', 'creates_incident', 'published_at', 'published_by'] as const;

const SCOPE_COLUMNS = ['facility_id', 'area_id', 'segment_id', 'created_at'] as const;

const isOpen = (record: unknown): boolean =>
  (OPEN_STATUSES as readonly unknown[]).includes((record as { readonly status?: unknown } | undefined)?.status);

/**
 * Only an open version is edited or discarded: a published or superseded one is history (the
 * database freezes it, `version_not_editable`, and keeps it while events point at it).
 */
const VERSION_RULES: Rule[] = [
  {
    target: { kind: 'action', name: 'edit' },
    deny: 'run',
    when: (ctx) => !isOpen(ctx.record),
    fallback: 'disable',
    reason: 'A published or superseded version is history and cannot change: use “Edit draft” on the rule.',
  },
  {
    target: { kind: 'action', name: 'delete' },
    deny: 'run',
    when: (ctx) => !isOpen(ctx.record),
    fallback: 'disable',
    reason: 'Only a draft can be discarded: a version that was in force is kept with the events it raised.',
  },
];

/**
 * Event rule versions (`itap.event_rule_versions`): the behaviour of a rule (parameters by rule
 * type, severity, whether it opens incidents, scope), versioned. The open draft is edited as a
 * record and published by "Publish"; a superseded version can be put back ("Roll back"). Reached
 * from its rule; no list page of its own. Created only by the rule's "Edit draft".
 */
export const eventRuleVersion = defineResource(EVENT_RULE_VERSION_RESOURCE, {
  texts: {
    label: 'Rule version',
    labelPlural: 'Rule versions',
    doc: {
      summary:
        'One version of an event rule’s behaviour: parameters, severity, incident and scope. Drafts are edited; one published version is in force; superseded ones are history.',
    },
  },
  basePath: '/event-rule-versions',
  displayField: 'version',
  recordTitle: (record) => (typeof record.version === 'number' ? `Version ${record.version}` : null),
  data: { provider: 'hasura' },
  operations: { create: false },
  fields: eventRuleVersionFields,
  rules: VERSION_RULES,
  actions: (r) => ({
    item: [r.action.flow('publish', publishFlow), r.action.flow('rollback', rollbackFlow)],
  }),
  views: {
    list: {
      page: false,
      columns: [...VERSION_COLUMNS],
      defaultSort: [{ field: 'version', direction: 'desc' }],
    },
    show: {
      header: (l) => [l.grid(['status', 'severity', 'creates_incident', 'published_at'])],
      body: (l) => [
        l.tabs(
          [
            l.panel(
              [
                l.grid(['rule_id', 'rule_type', 'version']),
                'parameters',
                l.grid(['escalation_policy_id', 'published_by']),
                l.grid(['created_at', 'updated_at']),
              ],
              { key: 'settings', texts: 'Settings' },
            ),
            l.panel(
              [
                l.panel(
                  [
                    l.place(relatedList(resourceByName(EVENT_RULE_SCOPE_RESOURCE)), {
                      key: 'open-scope',
                      // Also seeds "+ Create": a new place belongs to this version.
                      props: {
                        where: [{ field: 'version_id', op: 'eq', value: l.ref('record', 'id') }],
                        columns: [...SCOPE_COLUMNS],
                        open: 'none',
                      },
                    }),
                  ],
                  { key: 'scope-editable', when: l.in(l.ref('record', 'status'), [...OPEN_STATUSES]) },
                ),
                l.panel(
                  [
                    l.place(relatedList(resourceByName(EVENT_RULE_SCOPE_HISTORY_RESOURCE)), {
                      key: 'frozen-scope',
                      props: {
                        where: [{ field: 'version_id', op: 'eq', value: l.ref('record', 'id') }],
                        columns: [...SCOPE_COLUMNS],
                        open: 'none',
                      },
                    }),
                  ],
                  { key: 'scope-frozen', when: l.not(l.in(l.ref('record', 'status'), [...OPEN_STATUSES])) },
                ),
              ],
              { key: 'scope', texts: 'Scope' },
            ),
            l.panel(
              [
                l.place(relatedList(resourceByName(EVENT_RESOURCE)), {
                  key: 'version-events',
                  props: {
                    where: [{ field: 'rule_version_id', op: 'eq', value: l.ref('record', 'id') }],
                    columns: [...EVENT_COLUMNS],
                    open: 'page',
                  },
                }),
              ],
              { key: 'events', texts: 'Events' },
            ),
          ],
          { key: 'sections' },
        ),
      ],
    },
    edit: {
      header: (l) => [l.grid(['rule_id', 'rule_type', 'version', 'status'])],
      body: (l) => ['parameters', l.grid(['severity', 'creates_incident']), 'escalation_policy_id'],
    },
  },
});
