import { defineQuery } from '@burojs/core';
import { f } from '@burojs/field-types';
import { z } from 'zod';
import { schema } from '../../data/schema';

/** The registry key (`src/data/operations.ts`) the overview operations are bound under. */
export const OVERVIEW_BINDING = 'overview';

/** The dependency tag a mutation names to refresh the dashboard figures. */
export const DASHBOARD_TAG = 'dashboard';

/** One row of `itap_results.dashboard_kpi_rows`: the figures the dashboard shows. */
export const dashboardKpisOutput = z
  .object({
    unique_visitors_today: z.number(),
    current_occupancy: z.number(),
    open_incidents: z.number(),
    open_incidents_critical: z.number(),
    devices_offline: z.number(),
    deliveries_failed_24h: z.number(),
  })
  .nullable();

/**
 * The tracked SQL function `dashboard_kpis` (session argument only): the
 * current organization's headline figures, computed per request. `null` when
 * the session names no organization.
 */
export const dashboardKpis = defineQuery('itap:dashboard-kpis', {
  binding: { provider: 'hasura', resource: OVERVIEW_BINDING, operation: 'dashboardKpis' },
  input: schema(z.object({})),
  output: schema(dashboardKpisOutput),
  tags: [DASHBOARD_TAG],
  fields: {
    unique_visitors_today: f.number({
      texts: {
        label: 'Visitors today',
        doc: {
          summary:
            'Distinct people tracked since midnight in the organization’s time zone; merged identities count once.',
        },
      },
    }),
    current_occupancy: f.number({
      texts: {
        label: 'On site now',
        doc: { summary: 'Distinct people currently placed in an area of any facility.' },
      },
    }),
    open_incidents: f.number({
      texts: {
        label: 'Open incidents',
        doc: { summary: 'Incidents not yet resolved or closed, of any severity.' },
      },
    }),
    open_incidents_critical: f.number({
      texts: {
        label: 'Critical incidents',
        doc: { summary: 'Open incidents of critical severity.' },
      },
    }),
    devices_offline: f.number({
      texts: {
        label: 'Devices offline',
        doc: {
          summary:
            'Devices in service whose health is critical or whose connection failed at the last check.',
        },
      },
    }),
    deliveries_failed_24h: f.number({
      texts: {
        label: 'Failed notifications, 24 h',
        doc: {
          summary: 'Notification and webhook deliveries that failed for good in the last 24 hours.',
        },
      },
    }),
  },
});

/** The figures the dashboard shows, in order. */
export const DASHBOARD_KPI_ROWS = [
  'unique_visitors_today',
  'current_occupancy',
  'open_incidents',
  'open_incidents_critical',
  'devices_offline',
  'deliveries_failed_24h',
] as const;
