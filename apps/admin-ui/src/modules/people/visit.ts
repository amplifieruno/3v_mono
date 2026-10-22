import { type Rule, defineResource } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { VISIT_RESOURCE } from '../../data/resource-names';
import { VISIT_CHECKS, visitFields } from './visit-fields';
import { cancelFlow, checkInFlow, checkOutFlow } from './visit-flows';
import { visitSavedViews } from './visit-views';

/** A visit is edited while it is scheduled only (the update permission needs `scheduled`). */
const VISIT_RULES: Rule[] = [
  {
    target: { kind: 'action', name: 'edit' },
    deny: 'run',
    when: (ctx) => (ctx.record as { readonly status?: unknown } | undefined)?.status !== 'scheduled',
    fallback: 'disable',
    reason: 'Only a scheduled visit can be changed: this one was checked in, cancelled or marked no-show.',
  },
];

/**
 * Visits: a visitor expected by a host, for a company, at a facility (or any), in a time window.
 * Reception checks the visitor in (with a badge) and out, or cancels the visit; the daily
 * lifecycle job marks visits nobody came to as no-shows. The status changes only through those
 * functions; visits are history (no delete). The sidebar facility picker narrows the list, and
 * a visit with no facility shows under every facility (`empty: 'shared'`).
 */
export const visit = defineResource(VISIT_RESOURCE, {
  texts: {
    label: 'Visit',
    labelPlural: 'Visits',
    doc: {
      summary:
        'A visitor expected by a host in a time window: checked in on arrival with a badge, checked out on leaving, or cancelled. Cameras link the visitor’s movements on site to the visit.',
    },
  },
  basePath: '/visits',
  section: NAV_SECTIONS.people,
  order: 15,
  icon: NAV_ICONS.visits,
  displayField: 'code',
  data: { provider: 'hasura', scope: { facility: { field: 'facility_id', empty: 'shared' } } },
  prefill: { fromQuery: ['visitor_profile_id', 'host_profile_id', 'company_id', 'facility_id'] },
  operations: { delete: false },
  builtinActions: { delete: false },
  fields: visitFields,
  checks: VISIT_CHECKS,
  rules: VISIT_RULES,
  actions: (r) => ({
    item: [
      r.action.flow('check_in', checkInFlow),
      r.action.flow('check_out', checkOutFlow),
      r.action.flow('cancel', cancelFlow),
    ],
  }),
  views: {
    list: {
      columns: ['code', 'visitor_profile_id', 'host_profile_id', 'company_id', 'expected_start', 'expected_end', 'status'],
      optionalColumns: ['facility_id', 'purpose', 'badge_number', 'checked_in_at', 'checked_out_at'],
      defaultSort: [{ field: 'expected_start', direction: 'desc' }],
      search: { fields: ['code', 'purpose', 'badge_number'] },
      filters: {
        fields: ['status', 'visitor_profile_id', 'host_profile_id', 'company_id', 'facility_id', 'expected_start', 'expected_end'],
      },
      savedViews: visitSavedViews(),
    },
    show: {
      header: (l) => [l.grid(['code', 'status', 'expected_start', 'expected_end'])],
      body: (l) => [
        l.grid(['visitor_profile_id', 'host_profile_id', 'company_id']),
        l.grid(['facility_id', 'badge_number']),
        'purpose',
        l.grid(['checked_in_at', 'checked_out_at']),
        l.panel(['cancellation_reason'], {
          key: 'cancelled-notice',
          texts: { title: 'Cancelled' },
          when: l.equals(l.ref('record', 'status'), 'cancelled'),
        }),
        l.grid(['created_at', 'updated_at']),
      ],
    },
    edit: {
      body: (l) => [
        l.grid(['visitor_profile_id', 'host_profile_id']),
        l.grid(['company_id', 'facility_id']),
        l.grid(['expected_start', 'expected_end']),
        'purpose',
        'badge_number',
      ],
    },
  },
});
