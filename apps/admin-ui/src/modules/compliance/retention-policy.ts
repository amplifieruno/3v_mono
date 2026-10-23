import { type Layout, defineResource, relatedList } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { RETENTION_POLICY_RESOURCE, RETENTION_RUN_CLASS_RESOURCE } from '../../data/resource-names';
import { FACILITY_CLASSES } from './retention-classes';
import { activatePolicyFlow, deactivatePolicyFlow, deletePolicyFlow } from './retention-policy-flows';
import { RETENTION_POLICY_CHECKS, retentionPolicyFields } from './retention-policy-fields';
import { RUN_CLASS_COLUMNS } from './retention-run-class';

/** The facility is asked for only on a class whose rows belong to one facility (one condition for every form tree). */
const facilityClass = (l: Layout<typeof retentionPolicyFields>) => l.in(l.ref('values', 'data_class'), [...FACILITY_CLASSES]);

/**
 * Retention policies (`itap.retention_policies`): how long each class of data is kept before the
 * nightly run deletes, anonymizes or archives it, for the whole organization or (for classes
 * whose rows belong to one facility) one facility, which then beats the organization-wide policy
 * there. One active policy per class and facility; no policy means keep. The class rules (floors,
 * actions, facility classes) are mirrored as form checks; the server is the authority.
 * Activation and Delete are flows so their refusals read as sentences.
 */
export const retentionPolicy = defineResource(RETENTION_POLICY_RESOURCE, {
  texts: {
    label: 'Retention policy',
    labelPlural: 'Retention policies',
    doc: {
      summary:
        'How long one class of data is kept before the nightly run deletes, anonymizes or archives it, for the whole organization or one facility. No policy means the data is kept.',
    },
  },
  basePath: '/retention-policies',
  section: NAV_SECTIONS.compliance,
  order: 10,
  icon: NAV_ICONS.retentionPolicies,
  displayField: 'data_class',
  recordTitle: () => 'Retention policy',
  data: { provider: 'hasura' },
  fields: retentionPolicyFields,
  checks: RETENTION_POLICY_CHECKS,
  actions: (r) => ({
    item: [
      r.action.flow('deactivate', deactivatePolicyFlow),
      r.action.flow('activate', activatePolicyFlow),
      // Replaces the built-in Delete: the foreign key's refusal reads as a sentence.
      r.action.flow('delete', deletePolicyFlow),
    ],
  }),
  views: {
    list: {
      columns: ['data_class', 'facility_id', 'retain_days', 'action', 'is_active', 'description'],
      defaultSort: [{ field: 'data_class', direction: 'asc' }],
      filters: { pinned: ['data_class', 'is_active'], fields: ['data_class', 'facility_id', 'action', 'is_active'] },
      savedViews: [
        { id: 'active', texts: 'Active', state: { filters: [{ field: 'is_active', op: 'eq', value: true }] } },
        { id: 'inactive', texts: 'Inactive', state: { filters: [{ field: 'is_active', op: 'eq', value: false }] } },
        { id: 'facility', texts: 'Facility-specific', state: { filters: [{ field: 'facility_id', op: 'isNotNull' }] } },
      ],
    },
    show: {
      header: (l) => [l.grid(['data_class', 'facility_id', 'retain_days', 'action', 'is_active'])],
      body: (l) => [
        l.tabs(
          [
            l.panel(['description', l.grid(['created_by', 'created_at', 'updated_at'])], { key: 'details', texts: 'Details' }),
            l.panel(
              [
                l.place(relatedList(resourceByName(RETENTION_RUN_CLASS_RESOURCE)), {
                  key: 'policy-runs',
                  texts: { title: 'What the nightly runs did under this policy' },
                  props: {
                    where: [{ field: 'policy_id', op: 'eq', value: l.ref('record', 'id') }],
                    columns: ['run_id', ...RUN_CLASS_COLUMNS.filter((column) => column !== 'data_class')],
                    open: 'none',
                  },
                }),
              ],
              { key: 'runs', texts: 'Runs' },
            ),
          ],
          { key: 'sections' },
        ),
      ],
    },
    create: {
      body: (l) => [
        'data_class',
        l.field('facility_id', { when: facilityClass(l) }),
        l.grid(['retain_days', 'action']),
        'is_active',
        'description',
      ],
    },
    edit: {
      body: (l) => [l.grid(['data_class', l.field('facility_id', { when: facilityClass(l) }), 'is_active']), l.grid(['retain_days', 'action']), 'description'],
    },
  },
});
