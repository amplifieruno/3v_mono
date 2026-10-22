import {
  type DataProvider,
  type MutationContext,
  type QueryContext,
  createMutationDescriptor,
  createQueryDescriptor,
} from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ANALYTICS_BINDING } from '../../src/blocks/facility-period/analytics-binding';
import { createItapHasuraProvider } from '../../src/data/provider';
import { DASHBOARD_RESOURCE } from '../../src/data/resource-names';
import { contractProblems, dashboardProblems } from '../../src/modules/analytics/dashboard-contract';
import { DASHBOARD_WIDGET_QUERIES } from '../../src/modules/analytics/widget-blocks';
import { OVERVIEW_BINDING } from '../../src/modules/overview/kpis';
import { NOVA_FACILITY } from '../support/dev-hosts';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, NOVA_NAME, signInDev } from '../support/dev-stack';

/**
 * Dashboards of Nova through the console's provider, as `org_admin`: a dashboard with a widget of
 * every source is saved and read back unchanged and owned by the signed-in member; the seeded
 * dashboards the member sees pass the console's checks (they render); the server refuses what the
 * editor refuses; every widget query is readable for the role; the landing dashboard is the one
 * marked for the page. The created dashboard is deleted and the member's landing choice restored.
 */

const IDENTITY = { providerId: 'hasura', sessionKey: 'dashboards-dev-test', scopeKey: null, bindingRevision: '1' } as const;
const ref = { namespace: 'default', id: DASHBOARD_RESOURCE };

const session = { sessionKey: IDENTITY.sessionKey, scopeKey: null, generation: 1 };
const mutationContext = (): MutationContext => ({
  signal: new AbortController().signal,
  requestContext: {},
  session,
  providerServiceKey: 'hasura',
  idempotencyKey: crypto.randomUUID(),
});
const queryContext = (): QueryContext => ({ signal: new AbortController().signal, requestContext: {}, session, providerServiceKey: 'hasura' }) as QueryContext;

type Row = Record<string, unknown>;

const widget = (id: string, kind: string, query: string, params: Row, x: number, y: number, w: number) => ({
  id,
  kind,
  title: `Widget ${id}`,
  query,
  params,
  position: { x, y, w, h: 3 },
});

describe.skipIf(!DEV_STACK_ENABLED)('dashboards against the dev stack (Nova Tower)', () => {
  let provider: DataProvider;
  let facility: string;
  let previousDefault: string | null = null;
  const created: string[] = [];

  const mutate = (input: Row) =>
    provider.mutations?.[input.kind as 'createOne']?.(
      createMutationDescriptor({ ...IDENTITY, ref, resource: DASHBOARD_RESOURCE, idField: 'id', ...input } as never) as never,
      mutationContext(),
    );
  const query = (input: Row) =>
    provider.queries?.[input.kind as 'one']?.(
      createQueryDescriptor({ ...IDENTITY, ref, resource: DASHBOARD_RESOURCE, ...input } as never) as never,
      queryContext(),
    );
  const custom = async (resource: string, operation: string, input: Row = {}): Promise<unknown> =>
    provider.queries?.custom?.(
      createQueryDescriptor({ ...IDENTITY, kind: 'custom', ref: { namespace: 'default', id: operation }, resource, operation, input } as never) as never,
      queryContext(),
    );
  const mine = async (): Promise<Row[]> => {
    const { data } = (await query({
      kind: 'list',
      pagination: { kind: 'offset', page: 1, pageSize: 100 },
      filter: { field: 'owned_by_me', op: 'eq', value: true },
    })) as { data: Row[] };
    return data;
  };

  beforeAll(async () => {
    const auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
    const response = await fetch(DEV_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.getToken()}` },
      body: JSON.stringify({ query: `{ facilities(where: { name: { _eq: "${NOVA_FACILITY}" } }) { id } }` }),
    });
    facility = ((await response.json()) as { data: { facilities: { id: string }[] } }).data.facilities[0]?.id ?? '';
    expect(facility).not.toBe('');
    previousDefault = ((await mine()).find((row) => row.is_default === true)?.id as string | undefined) ?? null;
  });

  afterAll(async () => {
    for (const id of created) await mutate({ kind: 'deleteOne', id });
    if (previousDefault !== null) await mutate({ kind: 'updateOne', id: previousDefault, input: { is_default: true } });
  });

  it('should save a widget of every source and read it back unchanged, owned by the member', async () => {
    const widgets = [
      widget('kpis', 'kpi', 'dashboard_kpis', { figures: ['open_incidents'], details: false }, 0, 0, 12),
      widget('series', 'occupancy_series', 'occupancy_series', { facility_id: facility, days: 7, bucket: 'hour' }, 0, 3, 6),
      widget('now', 'occupancy_series', 'facility_occupancy_now', {}, 6, 3, 6),
      widget('flows', 'flow_matrix', 'flow_matrix', { facility_id: facility, days: 30, limit: 6 }, 0, 6, 6),
      widget('busy', 'heatmap', 'area_hourly_stats', { days: 14, by: 'weekday' }, 6, 6, 6),
      widget('weekdays', 'heatmap', 'occupancy_series', { facility_id: facility, days: 28 }, 0, 9, 4),
      widget('incidents', 'incidents_list', 'incidents', { status: ['open', 'acknowledged'], min_severity: 'high', limit: 5 }, 4, 9, 4),
      widget('segments', 'segment_trend', 'segment_daily_stats', { days: 14 }, 8, 9, 4),
      widget('devices', 'device_health', 'devices', { facility_id: null, limit: 3 }, 0, 12, 4),
      widget('device', 'device_health', 'device_health_metrics', { device_id: null }, 4, 12, 4),
      widget('day', 'device_health', 'device_health_metrics', { facility_id: facility, hours: 24 }, 8, 12, 4),
      widget('deliveries', 'deliveries', 'delivery_report', { period: '30d' }, 0, 15, 12),
    ];
    expect(dashboardProblems(widgets)).toEqual([]);
    const result = (await mutate({
      kind: 'createOne',
      input: { name: `dev-test dashboard ${Date.now()}`, description: 'Saved by the console test', is_shared: false, widgets },
    })) as { record: Row };
    const id = String(result.record.id);
    created.push(id);
    const { data } = (await query({ kind: 'one', id })) as { data: Row };
    expect(data.widgets).toEqual(widgets);
    expect(data).toMatchObject({ owned_by_me: true, is_shared: false, is_default: false });
  });

  it('should pass the console’s checks for every seeded dashboard the member sees', async () => {
    const { data } = (await query({ kind: 'list', pagination: { kind: 'offset', page: 1, pageSize: 100 } })) as { data: Row[] };
    const seeded = data.filter((row) => !String(row.name).startsWith('dev-test'));
    expect(seeded.map((row) => row.name)).toContain('Security overview');
    for (const row of seeded) expect(dashboardProblems(row.widgets), String(row.name)).toEqual([]);
  });

  it('should be refused by the server where the editor refuses a widget', async () => {
    const wide = [widget('wide', 'kpi', 'dashboard_kpis', {}, 8, 0, 6)];
    expect(contractProblems(wide).map((problem) => problem.code)).toEqual(['dashboardWidgets.positionWidth']);
    await expect(mutate({ kind: 'createOne', input: { name: `dev-test refused ${Date.now()}`, widgets: wide } })).rejects.toMatchObject({
      message: expect.stringContaining('Check constraint violation'),
    });
  });

  it('should let the role read every query a widget can name', async () => {
    const readable = (await custom(ANALYTICS_BINDING, 'readableRootFields')) as string[];
    expect(readable).not.toBeNull();
    for (const name of Object.values(DASHBOARD_WIDGET_QUERIES).flat()) expect(readable, name).toContain(name);
  });

  it('should sum up every device’s last 24 hours of checks for the 24-hour health table', async () => {
    const rows = (await custom(ANALYTICS_BINDING, 'deviceHealthDay', { facilityId: facility })) as Row[] | null;
    expect(rows).not.toBeNull();
    expect(rows?.length).toBeGreaterThan(0);
    const checked = rows?.filter((row) => ((row.device_health_metrics_aggregate as { aggregate: { count: number } }).aggregate.count ?? 0) > 0) ?? [];
    expect(checked.length).toBeGreaterThan(0);
  });

  it('should show the dashboard marked for the landing page', async () => {
    const id = created[0] as string;
    await mutate({ kind: 'updateOne', id, input: { is_default: true } });
    expect(await custom(OVERVIEW_BINDING, 'landingDashboard')).toMatchObject({ id });
    expect((await mine()).filter((row) => row.is_default === true).map((row) => row.id)).toEqual([id]);
  });
});
