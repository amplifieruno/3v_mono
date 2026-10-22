import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { expectDenied, expectError } from './support/fixtures.js';
import { savedSearchWorld as world } from './support/search.js';
import { runSqlRows } from './support/sql.js';

/**
 * Dashboards (slice 7, task 5; spec §6.10): owner-managed (owner stamped from the session), shared ones readable but
 * not editable by the organization; widgets validated by itap.valid_dashboard_widgets (widget contract in the
 * migration header).
 */

const INSERT = `
  mutation ($o: dashboards_insert_input!) { insert_dashboards_one(object: $o) { id owner_id } }
`;
const LIST = `query { dashboards(order_by: { name: asc }) { id name is_shared } }`;
const RENAME = `
  mutation ($id: uuid!) { update_dashboards_by_pk(pk_columns: { id: $id }, _set: { name: "Renamed" }) { id } }
`;
const SET_WIDGETS = `
  mutation ($id: uuid!, $w: jsonb!) { update_dashboards_by_pk(pk_columns: { id: $id }, _set: { widgets: $w }) { id } }
`;
const REMOVE = `mutation ($id: uuid!) { delete_dashboards_by_pk(id: $id) { id } }`;
const AUDIT = `query ($id: uuid!) { audit_log(where: { entity: { _eq: "dashboards" }, entity_id: { _eq: $id } }) { action } }`;

type Widget = Record<string, unknown>;

function widget(overrides: Widget = {}): Widget {
  return {
    id: 'kpis',
    kind: 'kpi',
    title: 'Today',
    query: 'dashboard_kpis',
    params: {},
    position: { x: 0, y: 0, w: 12, h: 2 },
    ...overrides,
  };
}

const VALID: Widget[] = [
  widget(),
  widget({ id: 'occ', kind: 'occupancy_series', title: 'Occupancy', query: 'occupancy_series', params: { bucket: 'hour' }, position: { x: 0, y: 2, w: 8, h: 4 } }),
  widget({ id: 'now', kind: 'occupancy_series', title: 'Now', query: 'facility_occupancy_now', position: { x: 8, y: 2, w: 4, h: 4 } }),
  widget({ id: 'flow', kind: 'flow_matrix', title: 'Flows', query: 'flow_matrix', position: { x: 0, y: 6, w: 6, h: 4 } }),
  widget({ id: 'heat', kind: 'heatmap', title: 'Heatmap', query: 'area_hourly_stats', position: { x: 6, y: 6, w: 6, h: 4 } }),
  widget({ id: 'inc', kind: 'incidents_list', title: 'Incidents', query: 'incidents', params: { limit: 10 }, position: { x: 0, y: 10, w: 4, h: 4 } }),
  widget({ id: 'seg', kind: 'segment_trend', title: 'Segments', query: 'segment_daily_stats', position: { x: 4, y: 10, w: 4, h: 4 } }),
  widget({ id: 'dev', kind: 'device_health', title: 'Devices', query: 'devices', position: { x: 8, y: 10, w: 4, h: 4 } }),
  widget({ id: 'del', kind: 'deliveries', title: 'Deliveries', query: 'delivery_report', position: { x: 0, y: 14, w: 12, h: 3 } }),
];

async function create(client: ReturnType<typeof asOrgAdmin>, object: Record<string, unknown>): Promise<string> {
  const data = await client.request<{ insert_dashboards_one: { id: string } }>(INSERT, { o: { widgets: [widget()], ...object } });
  return data.insert_dashboards_one.id;
}

describe('dashboards permissions', () => {
  it('should stamp the owner from the session and let the owner edit and delete', async () => {
    const { user, a } = await world();
    const { insert_dashboards_one: row } = await a.request<{ insert_dashboards_one: { id: string; owner_id: string } }>(INSERT, {
      o: { name: 'Mine', widgets: VALID, layout: { columns: 12 } },
    });
    expect(row.owner_id).toBe(user.id);
    expect((await a.request<{ update_dashboards_by_pk: unknown }>(RENAME, { id: row.id })).update_dashboards_by_pk).not.toBeNull();
    expect((await a.request<{ audit_log: unknown[] }>(AUDIT, { id: row.id })).audit_log.length).toBeGreaterThanOrEqual(2);
    expect((await a.request<{ delete_dashboards_by_pk: unknown }>(REMOVE, { id: row.id })).delete_dashboards_by_pk).not.toBeNull();
  });

  it('should show shared dashboards to other members read-only and hide personal ones and their audit rows', async () => {
    const { orgB, other, a, c } = await world();
    const shared = await create(a, { name: 'Shared', is_shared: true });
    const personal = await create(a, { name: 'Personal' });
    expect((await c.request<{ dashboards: { name: string }[] }>(LIST)).dashboards.map((d) => d.name)).toEqual(['Shared']);
    expect((await c.request<{ update_dashboards_by_pk: unknown }>(RENAME, { id: shared })).update_dashboards_by_pk).toBeNull();
    expect((await c.request<{ delete_dashboards_by_pk: unknown }>(REMOVE, { id: shared })).delete_dashboards_by_pk).toBeNull();
    expect((await c.request<{ audit_log: unknown[] }>(AUDIT, { id: personal })).audit_log).toEqual([]);
    expect((await asOrgAdmin(other.id, orgB.id).request<{ dashboards: unknown[] }>(LIST)).dashboards).toEqual([]);
  });

  it('should keep the owner read-only', async () => {
    const { colleague, a } = await world();
    await expectDenied(create(a, { name: 'X', owner_id: colleague.id }), 'owner_id');
    const id = await create(a, { name: 'Y' });
    await expectDenied(a.request(`mutation ($id: uuid!, $u: uuid!) { update_dashboards_by_pk(pk_columns: { id: $id }, _set: { owner_id: $u }) { id } }`, { id, u: colleague.id }), 'owner_id');
  });
});

describe('dashboard console fields', () => {
  const MINE = `query { dashboards(order_by: { name: asc }) { name owned_by_me is_default } }`;
  const SET_DEFAULT = `
    mutation ($id: uuid!) { update_dashboards_by_pk(pk_columns: { id: $id }, _set: { is_default: true }) { id } }
  `;

  it('should tell each member whether they own a dashboard', async () => {
    const { a, c } = await world();
    await create(a, { name: 'Shared', is_shared: true });
    await create(c, { name: 'Own' });
    expect((await a.request<{ dashboards: unknown[] }>(MINE)).dashboards).toEqual([
      { name: 'Shared', owned_by_me: true, is_default: false },
    ]);
    expect((await c.request<{ dashboards: unknown[] }>(MINE)).dashboards).toEqual([
      { name: 'Own', owned_by_me: true, is_default: false },
      { name: 'Shared', owned_by_me: false, is_default: false },
    ]);
  });

  it('should keep one default per owner and never let another member set it on a shared dashboard', async () => {
    const { a, c } = await world();
    const first = await create(a, { name: 'First', is_default: true, is_shared: true });
    const second = await create(a, { name: 'Second' });
    await a.request(SET_DEFAULT, { id: second });
    const defaults = (await a.request<{ dashboards: { name: string; is_default: boolean }[] }>(MINE)).dashboards;
    expect(defaults.filter((d) => d.is_default).map((d) => d.name)).toEqual(['Second']);
    // Another member's default stays theirs: the shared dashboard is not editable for them.
    expect((await c.request<{ update_dashboards_by_pk: unknown }>(SET_DEFAULT, { id: first })).update_dashboards_by_pk).toBeNull();
    const own = await create(c, { name: 'Colleague', is_default: true });
    expect(own).toBeTruthy();
    expect((await a.request<{ dashboards: { name: string; is_default: boolean }[] }>(MINE)).dashboards.find((d) => d.name === 'Second')?.is_default).toBe(true);
  });
});

describe('dashboard widget validation', () => {
  it('should accept every widget kind with its queries and an empty dashboard', async () => {
    const { a } = await world();
    expect(await create(a, { name: 'All kinds', widgets: VALID })).toBeTruthy();
    expect(await create(a, { name: 'Empty', widgets: [] })).toBeTruthy();
  });

  it('should reject malformed widgets', async () => {
    const { a } = await world();
    const id = await create(a, { name: 'Target' });
    const { position: _p, ...noPosition } = widget();
    const invalid: unknown[] = [
      { not: 'an array' },
      [widget({ kind: 'pie_chart' })],
      [widget({ query: 'profiles' })],
      // A known query of another kind.
      [widget({ kind: 'kpi', query: 'flow_matrix' })],
      [widget({ id: '' })],
      [widget(), widget()],
      [widget({ title: '   ' })],
      [widget({ params: [] })],
      [noPosition],
      [widget({ extra: true })],
      [widget({ position: { x: 0, y: 0, w: 0, h: 2 } })],
      [widget({ position: { x: 6, y: 0, w: 8, h: 2 } })],
      [widget({ position: { x: 0.5, y: 0, w: 4, h: 2 } })],
      [widget({ position: { x: 0, y: -1, w: 4, h: 2 } })],
      ['kpi'],
      Array.from({ length: 51 }, (_, i) => widget({ id: `w${i}` })),
    ];
    for (const w of invalid) {
      const error = await expectError(a.request(SET_WIDGETS, { id, w }));
      expect(`${error.message} ${error.detail ?? ''}`).toMatch(/dashboards_widgets_valid/);
    }
    await expectError(create(a, { name: 'Bad layout', layout: [] }));
    await expectError(create(a, { name: '  ' }));
  });

  it('should accept integral positions written as decimals and reject fractions without raising', async () => {
    const { a } = await world();
    const id = await create(a, { name: 'Decimals' });
    const ok = await a.request<{ update_dashboards_by_pk: unknown }>(SET_WIDGETS, {
      id, w: [widget({ position: { x: 5.0, y: 0, w: 7.0, h: 2 } })],
    });
    expect(ok.update_dashboards_by_pk).not.toBeNull();
    const check = async (position: string) => (await runSqlRows(`select itap.valid_dashboard_widgets('[{"id":"a","kind":"kpi",
      "title":"t","query":"dashboard_kpis","params":{},"position":${position}}]'::jsonb)::text as v`))[0].v;
    expect(await check('{"x":5.0,"y":1e2,"w":7.0,"h":2.0}')).toBe('true');
    expect(await check('{"x":5.5,"y":0,"w":6,"h":2}')).toBe('false');
  });

  it('should keep dashboard names unique per owner', async () => {
    const { a, c } = await world();
    await create(a, { name: 'Ops' });
    await expectError(create(a, { name: 'Ops' }));
    expect(await create(c, { name: 'Ops' })).toBeTruthy();
  });
});
