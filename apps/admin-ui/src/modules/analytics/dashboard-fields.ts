import type { Rule } from '@burojs/core';
import { f } from '@burojs/field-types';
import { USER_RESOURCE } from '../../data/resource-names';
import { dashboardWidgetsField } from '../../fields/dashboard-widgets';
import { checkNotBlank } from '../../fields/not-blank';

/**
 * Columns of `itap.dashboards` the `org_admin` role reads: the member's own dashboards and the
 * shared ones of the organization (`layout`, the free UI preferences object, is left to its
 * default and not shown). `owner_id` is stamped from the session; `owned_by_me` is computed.
 */
export const dashboardFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  name: f.string({
    required: true,
    validate: checkNotBlank(),
    texts: { label: 'Name', doc: { summary: 'The dashboard’s name, unique among your own dashboards.' } },
  }),
  description: f.text({ nullable: true, texts: { label: 'Description', doc: { summary: 'What the dashboard is for, shown under its name.' } } }),
  is_shared: f.boolean({
    default: false,
    texts: {
      label: 'Shared',
      doc: {
        summary:
          'Shared with the organization: every member can open it, read only; only you change or delete it. Each widget still reads only what the viewer may read.',
      },
    },
  }),
  is_default: f.boolean({
    default: false,
    texts: {
      label: 'On my Dashboard page',
      doc: {
        summary:
          'Shown on your Dashboard page, the console’s landing page, above the key figures. One of your dashboards at a time: choosing another takes it from the previous one.',
      },
    },
  }),
  owner_id: f.relation({
    to: USER_RESOURCE,
    system: true,
    in: ['list', 'show'],
    open: 'none',
    texts: { label: 'Owner', doc: { summary: 'Who made the dashboard: the only member who can change, share or delete it.' } },
  }),
  owned_by_me: f.boolean({
    system: true,
    in: [],
    texts: { label: 'Mine', doc: { summary: 'Whether you own the dashboard (else it is shared with you, read only).' } },
  }),
  widgets: dashboardWidgetsField({
    // The record page draws the widgets themselves (`itap:dashboard-grid`), not their list.
    in: ['create', 'edit'],
    texts: {
      label: 'Widgets',
      doc: {
        summary:
          'What the dashboard shows: up to 50 widgets, each a kind (key figures, occupancy, flows, busy hours, incidents, segment trends, device health, deliveries), what it reads, its settings and its place on a 12-column grid.',
      },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['list', 'show'] }),
};

/** Whether the rule's record is a saved dashboard someone else owns (a new one is the member's own). */
const someoneElses = (record: unknown): boolean => {
  const row = record as Readonly<Record<string, unknown>> | undefined | null;
  return typeof row?.id === 'string' && row.id !== '' && row.owned_by_me !== true;
};

/** Why a dashboard shared by someone else cannot be changed (beside every disabled action and field). */
export const NOT_OWNER_REASON = 'Shared with you by its owner: only the owner can change or delete it.';

/**
 * Only the owner changes or deletes a dashboard (the database's permissions refuse the same): a
 * dashboard shared by someone else is offered read only, with the reason, its form locked too.
 */
export const DASHBOARD_RULES: Rule[] = [
  {
    target: { kind: 'action', name: ['edit', 'delete'] },
    deny: 'run',
    when: (ctx) => someoneElses(ctx.record),
    fallback: 'disable',
    reason: NOT_OWNER_REASON,
  },
  {
    target: { kind: 'field' },
    deny: 'edit',
    when: (ctx) => someoneElses(ctx.record),
    fallback: 'disable',
    reason: NOT_OWNER_REASON,
  },
];

/** The dashboard list's views: your own and those shared with you. */
export const DASHBOARD_SAVED_VIEWS = [
  { id: 'mine', texts: 'Mine', state: { filters: [{ field: 'owned_by_me', op: 'eq', value: true }] } },
  { id: 'shared-with-me', texts: 'Shared with me', state: { filters: [{ field: 'owned_by_me', op: 'eq', value: false }] } },
];
