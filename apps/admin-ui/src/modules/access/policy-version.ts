import { type Layout, cond, defineResource, ref, relatedList } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import {
  ACCESS_POLICY_ACCESS_LEVEL_SUBJECT_RESOURCE,
  ACCESS_POLICY_ACCESS_POINT_TARGET_RESOURCE,
  ACCESS_POLICY_AREA_TARGET_RESOURCE,
  ACCESS_POLICY_FACILITY_TARGET_RESOURCE,
  ACCESS_POLICY_PROFILE_SUBJECT_RESOURCE,
  ACCESS_POLICY_PROFILE_TYPE_SUBJECT_RESOURCE,
  ACCESS_POLICY_SEGMENT_SUBJECT_RESOURCE,
  ACCESS_POLICY_SUBJECT_RESOURCE,
  ACCESS_POLICY_TARGET_RESOURCE,
  ACCESS_POLICY_VERSION_RESOURCE,
} from '../../data/resource-names';
import { versionDecisionsPanel } from './access-tabs';
import { POLICY_VERSION_COLUMNS, accessPolicyVersionFields } from './policy-version-fields';
import { VERSION_CHECKS, VERSION_RULES } from './policy-version-rules';
import { SUBJECT_COLUMNS } from './policy-subjects';
import { TARGET_COLUMNS } from './policy-targets';
import { simulationBlock } from './simulation-block';
import { approveFlow, rejectFlow, rollbackFlow, submitFlow } from './version-flows';

type Fields = typeof accessPolicyVersionFields;

/** The kinds of subject and target a draft lists, each with its own add form (G45). */
const SUBJECT_KINDS = [
  [ACCESS_POLICY_PROFILE_SUBJECT_RESOURCE, 'profile_id', 'people', 'People'],
  [ACCESS_POLICY_SEGMENT_SUBJECT_RESOURCE, 'segment_id', 'segments', 'Segments'],
  [ACCESS_POLICY_PROFILE_TYPE_SUBJECT_RESOURCE, 'profile_type', 'profile-types', 'Profile types'],
  [ACCESS_POLICY_ACCESS_LEVEL_SUBJECT_RESOURCE, 'access_level', 'access-levels', 'Minimum access levels'],
] as const;
const TARGET_KINDS = [
  [ACCESS_POLICY_FACILITY_TARGET_RESOURCE, 'facility_id', 'facilities', 'Facilities'],
  [ACCESS_POLICY_AREA_TARGET_RESOURCE, 'area_id', 'areas', 'Areas (with the areas inside them)'],
  [ACCESS_POLICY_ACCESS_POINT_TARGET_RESOURCE, 'access_point_id', 'access-points', 'Access points'],
] as const;

/**
 * A Who or Where tab: on a draft, one titled list per kind (add, remove); on any other version
 * the whole set, read only (a pending version is frozen, a published or superseded one is history).
 */
function membersTab(
  l: Layout<Fields>,
  key: 'subjects' | 'targets',
  title: string,
  kinds: typeof SUBJECT_KINDS | typeof TARGET_KINDS,
  all: { readonly resource: string; readonly columns: readonly string[] },
) {
  const byVersion = [{ field: 'version_id', op: 'eq', value: l.ref('record', 'id') }] as const;
  const draft = l.equals(l.ref('record', 'status'), 'draft');
  return l.panel(
    [
      l.panel(
        kinds.map(([resource, column, kindKey, kindTitle]) =>
          l.panel(
            [
              l.place(relatedList(resourceByName(resource)), {
                key: `draft-${kindKey}`,
                // Also seeds "+ Create": a new row belongs to this version.
                props: {
                  where: [...byVersion, { field: column, op: 'nnull', value: true }],
                  columns: [column, 'created_at'],
                  open: 'none',
                },
              }),
            ],
            { key: `kind-${kindKey}`, texts: kindTitle },
          ),
        ),
        { key: `${key}-editable`, when: draft },
      ),
      l.panel(
        [
          l.place(relatedList(resourceByName(all.resource)), {
            key: `frozen-${key}`,
            props: { where: [...byVersion], columns: [...all.columns], open: 'none' },
          }),
        ],
        { key: `${key}-frozen`, when: l.not(draft) },
      ),
    ],
    { key, texts: title },
  );
}

/**
 * Access policy versions (`itap.access_policy_versions`): what a policy does (effect, priority,
 * schedule, validity, maximum risk) and whom and where it names (subjects, targets). A draft is
 * edited, then submitted; a second member approves it (four-eyes) and it goes in force, or
 * rejects it with a reason. Created only by "Draft a change" and "Roll back to this version".
 */
export const accessPolicyVersion = defineResource(ACCESS_POLICY_VERSION_RESOURCE, {
  texts: {
    label: 'Policy version',
    labelPlural: 'Policy versions',
    doc: {
      summary:
        'One version of an access policy: effect, priority, schedule, validity, maximum risk, who and where. Drafts are edited, submitted and approved by a second member; one version is in force.',
    },
  },
  basePath: '/access-policy-versions',
  section: NAV_SECTIONS.access,
  order: 20,
  icon: NAV_ICONS.policyVersions,
  displayField: 'version',
  recordTitle: (record) => (typeof record.version === 'number' ? `Version ${record.version}` : null),
  data: { provider: 'hasura' },
  operations: { create: false },
  fields: accessPolicyVersionFields,
  rules: VERSION_RULES,
  checks: VERSION_CHECKS,
  actions: (r) => ({
    item: [
      r.action.flow('submit', submitFlow),
      r.action.flow('approve', approveFlow),
      r.action.flow('reject', rejectFlow),
      r.action.modal(
        'simulate',
        { block: simulationBlock, props: { versionId: ref('record', 'id') }, host: 'sheet' },
        {
          texts: {
            label: 'Simulate',
            doc: {
              summary:
                'Tries the version against the doors’ past decisions: which would come out differently if it were in force. Nothing is decided, recorded or sent.',
            },
          },
          icon: NAV_ICONS.simulatePolicy,
          surfaces: { default: 'menu', show: 'auto' },
          when: cond.in(ref('record', 'status'), ['draft', 'pending_approval', 'superseded']),
        },
      ),
      r.action.flow('rollback', rollbackFlow),
    ],
  }),
  views: {
    list: {
      columns: ['policy_id', ...POLICY_VERSION_COLUMNS],
      defaultSort: [{ field: 'submitted_at', direction: 'desc' }],
      filters: { pinned: ['status', 'effect'], fields: ['status', 'effect', 'policy_id', 'submitted_at', 'published_at'] },
      savedViews: [
        {
          id: 'awaiting-approval',
          texts: 'Awaiting approval',
          state: { filters: [{ field: 'status', op: 'eq', value: 'pending_approval' }] },
        },
        { id: 'drafts', texts: 'Drafts', state: { filters: [{ field: 'status', op: 'eq', value: 'draft' }] } },
        { id: 'in-force', texts: 'In force', state: { filters: [{ field: 'status', op: 'eq', value: 'published' }] } },
      ],
    },
    show: {
      header: (l) => [l.grid(['policy_id', 'status', 'effect', 'priority'])],
      body: (l) => [
        l.tabs(
          [
            l.panel(
              [
                l.grid(['version', 'effect', 'priority']),
                'schedule',
                l.grid(['valid_from', 'valid_until']),
                l.field('max_risk', { when: l.equals(l.ref('record', 'effect'), 'allow') }),
                l.grid(['created_at', 'updated_at']),
              ],
              { key: 'settings', texts: 'Settings' },
            ),
            membersTab(l, 'subjects', 'Who', SUBJECT_KINDS, { resource: ACCESS_POLICY_SUBJECT_RESOURCE, columns: SUBJECT_COLUMNS }),
            membersTab(l, 'targets', 'Where', TARGET_KINDS, { resource: ACCESS_POLICY_TARGET_RESOURCE, columns: TARGET_COLUMNS }),
            l.panel(
              [
                l.grid(['submitted_by', 'submitted_at']),
                l.grid(['approved_by', 'approved_at', 'published_at']),
                l.panel([l.grid(['rejected_by', 'rejected_at']), 'rejection_reason'], {
                  key: 'last-rejection',
                  when: l.present(l.ref('record', 'rejected_at')),
                }),
              ],
              { key: 'approval', texts: 'Approval' },
            ),
            versionDecisionsPanel(l),
          ],
          { key: 'sections' },
        ),
      ],
    },
    edit: {
      header: (l) => [l.grid(['policy_id', 'version', 'status'])],
      body: (l) => [
        l.grid(['effect', 'priority']),
        'schedule',
        l.grid(['valid_from', 'valid_until']),
        // Hidden for a deny, and then not sent: a value kept from an earlier allow stays stored but
        // the engine reads max_risk on an allow only (buro sends no null for a hidden field, G74).
        l.field('max_risk', { when: l.equals(l.ref('values', 'effect'), 'allow') }),
      ],
    },
  },
});
