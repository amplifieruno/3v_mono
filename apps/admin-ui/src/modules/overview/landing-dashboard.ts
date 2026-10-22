import { defineQuery } from '@burojs/core';
import { f } from '@burojs/field-types';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { DASHBOARD_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { OVERVIEW_BINDING } from './kpis';

const landingRow = z.object({ id: z.string(), name: z.string(), widgets: z.unknown() });

/** The signed-in member's landing dashboard, or nothing (`id` and `name` `null`, no widgets). */
export const landingOutput = z.object({ id: z.string().nullable(), name: z.string().nullable(), widgets: z.unknown() });

/**
 * The member's own dashboard marked "On my Dashboard page" (`is_default`, one per owner; a
 * dashboard shared by someone else is never another member's landing page).
 */
export const landingDashboardOperation = hasuraOperation(OVERVIEW_BINDING, 'landingDashboard', {
  kind: 'query',
  document: `query LandingDashboard {
  dashboards(where: { owned_by_me: { _eq: true }, is_default: { _eq: true } }, limit: 1) {
    id
    name
    widgets
  }
}`,
  variables: () => undefined,
  mapResult: (data) => {
    const rows = z.array(landingRow).safeParse(rootOf(data, 'dashboards'));
    const row = rows.success ? rows.data[0] : undefined;
    return row === undefined ? { id: null, name: null, widgets: [] } : row;
  },
});

/** The landing dashboard of the Dashboard page (`itap:landing-dashboard`); refreshed when a dashboard changes. */
export const landingDashboard = defineQuery('itap:landing-dashboard', {
  binding: landingDashboardOperation.binding,
  input: schema(z.object({})),
  output: schema(landingOutput),
  reads: [resourceByName(DASHBOARD_RESOURCE)],
  fields: {
    id: f.string({ texts: { label: 'Dashboard', doc: { summary: 'Your dashboard shown on the Dashboard page; empty when none is chosen.' } } }),
    name: f.string({ texts: { label: 'Name', doc: { summary: 'That dashboard’s name.' } } }),
    widgets: f.json({ texts: { label: 'Widgets', doc: { summary: 'That dashboard’s widgets, drawn on the page.' } } }),
  },
});
