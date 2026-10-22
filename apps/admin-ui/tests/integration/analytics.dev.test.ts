import { type DataProvider, type QueryContext, createQueryDescriptor } from '@burojs/core';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ItapAuthProvider } from '../../src/auth';
import { dayWindow, hourWindow } from '../../src/blocks/charts/period';
import { zonedMidnight } from '../../src/blocks/charts/zoned-time';
import { ANALYTICS_BINDING } from '../../src/blocks/facility-period/analytics-binding';
import { createItapHasuraProvider } from '../../src/data/provider';
import {
  AREA_HOURLY_STAT_RESOURCE,
  AREA_TRANSITION_RESOURCE,
  FACILITY_DAILY_STAT_RESOURCE,
} from '../../src/data/resource-names';
import { OVERVIEW_BINDING, dashboardKpisOutput } from '../../src/modules/overview/kpis';
import { NOVA_FACILITY } from '../support/dev-hosts';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, NOVA_NAME, signInDev } from '../support/dev-stack';

/**
 * The analytics reads against the dev stack (Nova, `org_admin`, the seeded 30-day history) through
 * the console's provider: every analytic block's query for the Nova Tower facility, the day buckets
 * of `occupancy_series` starting at the facility's own midnights (Review Focus 5), and the three
 * stats lists. Read only: nothing to clean up.
 */

const IDENTITY = { providerId: 'hasura', sessionKey: 'analytics-dev-test', scopeKey: null, bindingRevision: '1' } as const;

function context(): QueryContext {
  return {
    signal: new AbortController().signal,
    requestContext: {},
    session: { sessionKey: IDENTITY.sessionKey, scopeKey: null, generation: 1 },
    providerServiceKey: 'hasura',
  } as QueryContext;
}

type Row = Readonly<Record<string, unknown>>;
const ref = (id: string) => ({ namespace: 'default', id });

describe.skipIf(!DEV_STACK_ENABLED)('analytics against the dev stack (Nova Tower)', () => {
  let auth: ItapAuthProvider;
  let provider: DataProvider;
  let facility: { id: string; timezone: string };

  const custom = async (operation: string, input: Row, resource = ANALYTICS_BINDING): Promise<unknown> =>
    provider.queries?.custom?.(
      createQueryDescriptor({ ...IDENTITY, kind: 'custom', ref: ref(operation), resource, operation, input } as never) as never,
      context(),
    );

  const list = async (resource: string, sortField: string): Promise<readonly Row[]> => {
    const { data } = (await provider.queries?.list?.(
      createQueryDescriptor({
        ...IDENTITY,
        kind: 'list',
        ref: ref(resource),
        resource,
        pagination: { mode: 'offset', page: 1, perPage: 20 },
        filter: { field: 'facility_id', op: 'eq', value: facility.id },
        sort: [{ field: sortField, direction: 'desc' }],
      } as never) as never,
      context(),
    )) as { data: readonly Row[] };
    return data;
  };

  beforeAll(async () => {
    auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
    const response = await fetch(DEV_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.getToken()}` },
      body: JSON.stringify({ query: `{ facilities(where: { name: { _eq: "${NOVA_FACILITY}" } }) { id timezone } }` }),
    });
    const body = (await response.json()) as { data: { facilities: { id: string; timezone: string }[] } };
    const found = body.data.facilities[0];
    expect(found).toBeDefined();
    facility = found as { id: string; timezone: string };
  });

  it('should read the facility’s name and time zone', async () => {
    expect(await custom('facilityZone', { facilityId: facility.id })).toEqual({
      id: facility.id,
      name: NOVA_FACILITY,
      timezone: facility.timezone,
    });
    expect(facility.timezone).not.toBe('UTC');
  });

  it('should bucket the occupancy by the facility’s days, each starting at its midnight (Review Focus 5)', async () => {
    const window = dayWindow(new Date(), facility.timezone, 7);
    const rows = (await custom('occupancySeries', { facilityId: facility.id, from: window.from, to: window.to, bucket: 'day' })) as Row[];
    expect(rows.map((row) => row.day)).toEqual(window.days);
    for (const row of rows) {
      expect(Date.parse(String(row.bucket_start))).toBe(zonedMidnight(String(row.day), facility.timezone).getTime());
    }
    expect(rows.some((row) => Number(row.unique_identities) > 0)).toBe(true);
  });

  it('should read the last 24 hours by hour', async () => {
    const bounds = hourWindow(new Date(), 1);
    const rows = (await custom('occupancySeries', { facilityId: facility.id, ...bounds, bucket: 'hour' })) as Row[];
    expect(rows).toHaveLength(24);
    expect(Date.parse(String(rows[0]?.bucket_start))).toBe(Date.parse(bounds.from));
  });

  it('should read the moves between the facility’s areas, every area named', async () => {
    const window = dayWindow(new Date(), facility.timezone, 30);
    const read = (await custom('flowMatrix', { facilityId: facility.id, from: window.from, to: window.to })) as {
      rows: { from_area_id: string; to_area_id: string; count: number }[];
      areas: { id: string }[];
    };
    expect(read.rows.length).toBeGreaterThan(0);
    const named = new Set(read.areas.map((area) => area.id));
    expect(read.rows.every((row) => named.has(row.from_area_id) && named.has(row.to_area_id) && row.count > 0)).toBe(true);
  });

  it('should read the hourly rows of the areas and of the whole facility for the heatmap', async () => {
    const window = dayWindow(new Date(), facility.timezone, 30);
    const byArea = (await custom('heatmapHours', { facilityId: facility.id, from: window.from, to: window.to, by: 'area' })) as {
      rows: { area_id: string | null }[];
    };
    expect(byArea.rows.length).toBeGreaterThan(0);
    expect(byArea.rows.every((row) => row.area_id !== null)).toBe(true);
    const total = (await custom('heatmapHours', { facilityId: facility.id, from: window.from, to: window.to, by: 'weekday' })) as {
      rows: { area_id: string | null }[];
    };
    expect(total.rows.length).toBeGreaterThan(0);
    expect(total.rows.every((row) => row.area_id === null)).toBe(true);
  });

  it('should list the newest open incidents of the facility', async () => {
    const read = (await custom('incidentsList', { facilityId: facility.id, status: 'open', minSeverity: 'info', limit: 5 })) as {
      rows: { status: string }[];
      total: number;
    };
    expect(read.rows.length).toBeLessThanOrEqual(5);
    expect(read.total).toBeGreaterThanOrEqual(read.rows.length);
    expect(read.rows.every((row) => !['resolved', 'closed'].includes(row.status))).toBe(true);
  });

  it('should read the segments’ daily figures with the organization’s time zone', async () => {
    const read = (await custom('segmentTrend', { segmentId: null, days: 30 })) as { timezone: string | null; rows: unknown[] };
    expect(read.timezone).not.toBeNull();
    expect(read.rows.length).toBeGreaterThan(0);
  });

  it('should read the devices in service of the facility', async () => {
    const rows = (await custom('deviceHealthSummary', { facilityId: facility.id })) as { status: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.status !== 'inactive')).toBe(true);
  });

  it('should read the key figures with the severities and the segment movers', async () => {
    const kpis = dashboardKpisOutput.parse(await custom('dashboardKpis', {}, OVERVIEW_BINDING));
    expect(kpis?.open_incidents).toBe(
      (kpis?.open_incidents_critical ?? 0) +
        (kpis?.open_incidents_high ?? 0) +
        (kpis?.open_incidents_medium ?? 0) +
        (kpis?.open_incidents_low ?? 0) +
        (kpis?.open_incidents_info ?? 0),
    );
  });

  it('should list the facility’s daily figures, hourly figures and moves between areas', async () => {
    const daily = await list(FACILITY_DAILY_STAT_RESOURCE, 'day');
    expect(daily.length).toBeGreaterThan(0);
    expect(daily.every((row) => row.facility_id === facility.id)).toBe(true);
    expect((await list(AREA_HOURLY_STAT_RESOURCE, 'hour')).length).toBeGreaterThan(0);
    expect((await list(AREA_TRANSITION_RESOURCE, 'day')).length).toBeGreaterThan(0);
  });
});
