import { type Rule, defineResource, isRecordProbe, relatedList } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { ACCESS_POLICY_RESOURCE, ACCESS_POLICY_VERSION_RESOURCE } from '../../data/resource-names';
import { POLICY_COLUMNS, accessPolicyFields } from './policy-fields';
import { archiveFlow, draftChangeFlow } from './policy-flows';
import { POLICY_VERSION_COLUMNS } from './policy-version-fields';

type Row = Readonly<Record<string, unknown>> | null | undefined;

/**
 * A policy that is in force cannot be deleted (the database's delete permission says the same):
 * archive it instead. An archived or never-approved policy can be deleted unless doors decided by
 * one of its versions (then the database refuses and it stays archived).
 */
const POLICY_RULES: Rule[] = [
  {
    target: { kind: 'action', name: 'delete' },
    deny: 'run',
    when: (ctx) => {
      if (isRecordProbe(ctx.record)) return false;
      const current = (ctx.record as Row)?.current_version_id;
      return typeof current === 'string' && current !== '';
    },
    fallback: 'disable',
    reason: 'This policy is in force: archive it instead, so its versions and the decisions they made stay.',
  },
];

/**
 * Access policies (`itap.access_policies`): who may pass which doors, when. The header holds the
 * name; what the policy does lives in versions (`./policy-version.ts`): "Draft a change" opens
 * the open version, which is edited, submitted and approved by a second member before it goes in
 * force. "Archive" retires a policy for good.
 */
export const accessPolicy = defineResource(ACCESS_POLICY_RESOURCE, {
  texts: {
    label: 'Access policy',
    labelPlural: 'Access policies',
    doc: {
      summary:
        'Who may pass which doors and when: allow or deny, by person, segment, profile type or access level, at facilities, areas or single doors. Changed through versions approved by a second member.',
    },
  },
  basePath: '/access-policies',
  section: NAV_SECTIONS.access,
  order: 10,
  icon: NAV_ICONS.accessPolicies,
  displayField: 'name',
  data: { provider: 'hasura' },
  fields: accessPolicyFields,
  rules: POLICY_RULES,
  actions: (r) => ({ item: [r.action.flow('draft_change', draftChangeFlow), r.action.flow('archive', archiveFlow)] }),
  views: {
    list: {
      columns: [...POLICY_COLUMNS],
      defaultSort: [{ field: 'name', direction: 'asc' }],
      search: { fields: ['code', { field: 'name', op: 'contains' }] },
      filters: { pinned: ['is_archived'], fields: ['is_archived', 'current_version_id'] },
      savedViews: [
        {
          id: 'in-force',
          texts: 'In force',
          state: { filters: [{ field: 'current_version_id', op: 'nnull', value: true }] },
        },
        {
          id: 'never-approved',
          texts: 'Never approved',
          state: {
            filters: [
              { field: 'current_version_id', op: 'isNull' },
              { field: 'is_archived', op: 'eq', value: false },
            ],
          },
        },
        { id: 'archived', texts: 'Archived', state: { filters: [{ field: 'is_archived', op: 'eq', value: true }] } },
      ],
    },
    show: {
      header: (l) => [l.grid(['code', 'current_version_id', 'is_archived'])],
      body: (l) => [
        l.tabs(
          [
            l.panel(
              [
                'name',
                'description',
                l.panel([l.grid(['archived_at', 'archived_by'])], {
                  key: 'archived',
                  when: l.equals(l.ref('record', 'is_archived'), true),
                }),
                l.grid(['created_at', 'updated_at']),
              ],
              { key: 'details', texts: 'Details' },
            ),
            l.panel(
              [
                l.place(relatedList(resourceByName(ACCESS_POLICY_VERSION_RESOURCE)), {
                  key: 'policy-versions',
                  props: {
                    where: [{ field: 'policy_id', op: 'eq', value: l.ref('record', 'id') }],
                    columns: [...POLICY_VERSION_COLUMNS],
                    open: 'page',
                  },
                }),
              ],
              { key: 'versions', texts: 'Versions' },
            ),
          ],
          { key: 'sections' },
        ),
      ],
    },
    create: { body: () => ['name', 'description'] },
    edit: {
      header: (l) => [l.grid(['code'])],
      body: () => ['name', 'description'],
    },
  },
});
