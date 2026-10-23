import { defineResource, relatedList } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { ACCESS_DECISION_RESOURCE, ACCESS_GRANT_RESOURCE } from '../../data/resource-names';
import { DECISION_RELATED_COLUMNS } from './decision-fields';
import { GRANT_COLUMNS, accessGrantFields } from './grant-fields';
import { GRANT_CHECKS, GRANT_RULES, revokeGrantFlow } from './grant-flows';

/**
 * Access grants (`itap.access_grants`): one person may pass one area (with the areas inside it)
 * or one access point between two moments, once or repeatedly, beside the policies. Created
 * here, never edited: a grant only ends early by "Revoke" with a reason. A single-use grant
 * reads Unused until a door consumed it, then Used (plan 10 Review Focus 4).
 */
export const accessGrant = defineResource(ACCESS_GRANT_RESOURCE, {
  texts: {
    label: 'Access grant',
    labelPlural: 'Access grants',
    doc: {
      summary:
        'Lets one person through one area or one access point for a limited time, once or repeatedly, when no policy decided. Never edited; revoked with a reason.',
    },
  },
  basePath: '/access-grants',
  section: NAV_SECTIONS.access,
  order: 30,
  icon: NAV_ICONS.accessGrants,
  displayField: 'valid_until',
  recordTitle: () => 'Access grant',
  data: { provider: 'hasura' },
  prefill: { fromQuery: ['profile_id', 'area_id', 'access_point_id'] },
  operations: { edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: accessGrantFields,
  rules: GRANT_RULES,
  checks: GRANT_CHECKS,
  actions: (r) => ({ item: [r.action.flow('revoke', revokeGrantFlow)] }),
  views: {
    list: {
      columns: [...GRANT_COLUMNS],
      optionalColumns: ['reason', 'granted_by', 'created_at'],
      defaultSort: [{ field: 'created_at', direction: 'desc' }],
      filters: {
        pinned: ['profile_id', 'single_use'],
        fields: ['profile_id', 'area_id', 'access_point_id', 'single_use', 'valid_from', 'valid_until', 'used_at', 'revoked_at'],
      },
      savedViews: [
        { id: 'not-revoked', texts: 'Not revoked', state: { filters: [{ field: 'revoked_at', op: 'isNull' }] } },
        {
          id: 'single-use-unused',
          texts: 'Single use, unused',
          state: {
            filters: [
              { field: 'single_use', op: 'eq', value: true },
              { field: 'used_at', op: 'isNull' },
              { field: 'revoked_at', op: 'isNull' },
            ],
          },
        },
        { id: 'used', texts: 'Used', state: { filters: [{ field: 'used_at', op: 'isNotNull' }] } },
        { id: 'revoked', texts: 'Revoked', state: { filters: [{ field: 'revoked_at', op: 'isNotNull' }] } },
      ],
    },
    show: {
      header: (l) => [l.grid(['profile_id', 'single_use', 'used_at', 'revoked_at'])],
      body: (l) => [
        l.tabs(
          [
            l.panel(
              [
                l.grid(['profile_id', 'area_id', 'access_point_id']),
                l.grid(['valid_from', 'valid_until']),
                l.grid(['single_use', 'used_at']),
                'reason',
                l.grid(['granted_by', 'created_at']),
                l.panel([l.grid(['revoked_by', 'revoked_at']), 'revoke_reason'], {
                  key: 'revocation',
                  when: l.present(l.ref('record', 'revoked_at')),
                }),
              ],
              { key: 'details', texts: 'Details' },
            ),
            l.panel(
              [
                l.place(relatedList(resourceByName(ACCESS_DECISION_RESOURCE)), {
                  key: 'grant-decisions',
                  props: {
                    where: [{ field: 'grant_id', op: 'eq', value: l.ref('record', 'id') }],
                    columns: [...DECISION_RELATED_COLUMNS],
                    open: 'page',
                  },
                }),
              ],
              { key: 'decisions', texts: 'Decisions' },
            ),
          ],
          { key: 'sections' },
        ),
      ],
    },
    create: {
      body: (l) => [
        'profile_id',
        l.grid(['area_id', 'access_point_id']),
        l.grid(['valid_from', 'valid_until']),
        'single_use',
        'reason',
      ],
    },
  },
});
