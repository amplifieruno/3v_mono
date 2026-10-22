import { defineQuery } from '@burojs/core';
import { f } from '@burojs/field-types';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { schema } from '../../data/schema';

/** The registry key the overview operations are bound under. */
export const OVERVIEW_BINDING = 'overview';

/** The dependency tag a mutation names to refresh the dashboard figures. */
export const DASHBOARD_TAG = 'dashboard';

/** One entry of `segment_top_movers`: a segment whose member count changed most since yesterday. */
export const segmentMover = z.object({
  segment_id: z.string(),
  code: z.string().nullable(),
  name: z.string(),
  member_count: z.number(),
  previous_count: z.number(),
  change: z.number(),
});

export type SegmentMover = z.infer<typeof segmentMover>;

/** One row of `itap_results.dashboard_kpi_rows`: the figures the dashboard and the KPI block show. */
export const dashboardKpisOutput = z
  .object({
    as_of: z.string(),
    local_date: z.string(),
    unique_visitors_today: z.number(),
    current_occupancy: z.number(),
    open_incidents: z.number(),
    open_incidents_critical: z.number(),
    open_incidents_high: z.number(),
    open_incidents_medium: z.number(),
    open_incidents_low: z.number(),
    open_incidents_info: z.number(),
    devices_offline: z.number(),
    deliveries_failed_24h: z.number(),
    segment_top_movers: z.array(segmentMover),
  })
  .nullable();

export type DashboardKpis = NonNullable<z.infer<typeof dashboardKpisOutput>>;

/**
 * `dashboard_kpis(hasura_session)`: the session argument is filled by Hasura
 * from the token, so the field takes no arguments. It returns a set of at most
 * one row; none when the token names no organization.
 */
export const dashboardKpisOperation = hasuraOperation(OVERVIEW_BINDING, 'dashboardKpis', {
  kind: 'query',
  document: `query DashboardKpis {
  dashboard_kpis {
    as_of
    local_date
    unique_visitors_today
    current_occupancy
    open_incidents
    open_incidents_critical
    open_incidents_high
    open_incidents_medium
    open_incidents_low
    open_incidents_info
    devices_offline
    deliveries_failed_24h
    segment_top_movers
  }
}`,
  variables: () => undefined,
  mapResult: (data) => {
    const rows = rootOf(data, 'dashboard_kpis');
    return Array.isArray(rows) ? (rows[0] ?? null) : null;
  },
});

/**
 * The tracked SQL function `dashboard_kpis` (session argument only): the
 * current organization's headline figures, computed per request. `null` when
 * the session names no organization.
 */
export const dashboardKpis = defineQuery('itap:dashboard-kpis', {
  binding: dashboardKpisOperation.binding,
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
    open_incidents_high: f.number({
      texts: { label: 'High incidents', doc: { summary: 'Open incidents of high severity.' } },
    }),
    open_incidents_medium: f.number({
      texts: { label: 'Medium incidents', doc: { summary: 'Open incidents of medium severity.' } },
    }),
    open_incidents_low: f.number({
      texts: { label: 'Low incidents', doc: { summary: 'Open incidents of low severity.' } },
    }),
    open_incidents_info: f.number({
      texts: { label: 'Info incidents', doc: { summary: 'Open incidents of severity info: for the record only.' } },
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
