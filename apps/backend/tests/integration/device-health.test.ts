import { describe, expect, it } from 'vitest';
import { asAdmin, asOrgAdmin } from './support/clients.js';
import { createDevice, createFacility } from './support/facilities.js';
import { createTwoOrgs, expectDenied } from './support/fixtures.js';
import { runSql, runSqlRows } from './support/sql.js';

const RECORD = `
  mutation Record($device: uuid!, $reachable: Boolean!, $latency: Float, $frame: Boolean!, $at: timestamptz!) {
    record_device_health(args: { p_device: $device, p_reachable: $reachable, p_latency_ms: $latency, p_frame_ok: $frame, p_checked_at: $at }) {
      id status health_status last_seen_at
    }
  }
`;
const STATE = `query($id: uuid!) { devices_by_pk(id: $id) { status health_status last_seen_at } }`;
const METRICS = `query($id: uuid!) { device_health_metrics(where: { device_id: { _eq: $id } }, order_by: { recorded_at: asc }) { recorded_at network_latency_ms frame_rate error_count cpu_usage memory_usage disk_usage } }`;
const EVENTS = `query($id: uuid!) { device_events(where: { device_id: { _eq: $id } }, order_by: { occurred_at: asc }) { kind message occurred_at } }`;

type Device = { status: string; health_status: string; last_seen_at: string | null };

const minute = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString();

async function setup() {
  const { orgA, user } = await createTwoOrgs();
  const a = asOrgAdmin(user.id, orgA.id);
  const facility = await createFacility(a);
  const device = await createDevice(a, facility.id, { stream_url: 'rtsp://mediamtx:8554/lobby' });
  const record = (reachable: boolean, n: number, frame = reachable, latency: number | null = reachable ? 12 : null) =>
    asAdmin().request<{ record_device_health: Device[] }>(RECORD, {
      device: device.id,
      reachable,
      latency,
      frame,
      at: minute(n),
    });
  const kinds = async () =>
    (await asAdmin().request<{ device_events: { kind: string }[] }>(EVENTS, { id: device.id })).device_events.map((e) => e.kind);
  const state = async () => (await asAdmin().request<{ devices_by_pk: Device }>(STATE, { id: device.id })).devices_by_pk;
  return { a, device, record, kinds, state };
}

describe('record_device_health', () => {
  it('should mark a reachable device with a frame healthy and store a metric row without host metrics', async () => {
    const { device, record, state } = await setup();
    await record(true, 0);
    expect(await state()).toMatchObject({ status: 'active', health_status: 'healthy', last_seen_at: expect.any(String) });
    const { device_health_metrics } = await asAdmin().request<{ device_health_metrics: Record<string, unknown>[] }>(METRICS, {
      id: device.id,
    });
    expect(device_health_metrics).toEqual([
      expect.objectContaining({ network_latency_ms: 12, frame_rate: null, error_count: 0, cpu_usage: null, memory_usage: null, disk_usage: null }),
    ]);
  });

  it('should map reachable without frame to warning and unreachable to critical + connection_error without last_seen_at', async () => {
    const { record, state } = await setup();
    await record(true, 0, false);
    expect(await state()).toMatchObject({ health_status: 'warning', status: 'active' });
    const seen = (await state()).last_seen_at;
    await record(false, 1);
    const down = await state();
    expect(down).toMatchObject({ health_status: 'critical', status: 'connection_error', last_seen_at: seen });
  });

  it('should emit exactly one offline and one online event per transition, not one per tick (Review Focus 3)', async () => {
    const { record, kinds, state } = await setup();
    await record(true, 0);
    await record(true, 1);
    for (let n = 2; n < 7; n++) await record(false, n);
    expect(await kinds()).toEqual(['offline']);
    for (let n = 7; n < 11; n++) await record(true, n);
    expect(await kinds()).toEqual(['offline', 'online']);
    expect(await state()).toMatchObject({ status: 'active', health_status: 'healthy' });
    await record(false, 11);
    expect(await kinds()).toEqual(['offline', 'online', 'offline']);
  });

  it('should emit an error event once when entering warning and recover status only from connection_error', async () => {
    const { a, device, record, kinds, state } = await setup();
    await record(true, 0, false);
    await record(true, 1, false);
    expect(await kinds()).toEqual(['error']);
    await a.request(`mutation($id: uuid!) { update_devices_by_pk(pk_columns: {id: $id}, _set: {status: maintenance}) { id } }`, { id: device.id });
    await record(false, 2);
    expect(await state()).toMatchObject({ status: 'maintenance', health_status: 'critical' });
    await record(true, 3);
    expect(await state()).toMatchObject({ status: 'maintenance', health_status: 'healthy' });
  });

  it('should be idempotent per (device, checked_at): a retry changes nothing', async () => {
    const { device, record, kinds } = await setup();
    await record(false, 0);
    await record(false, 0);
    await record(true, 0);
    expect(await kinds()).toEqual(['offline']);
    const { device_health_metrics } = await asAdmin().request<{ device_health_metrics: unknown[] }>(METRICS, { id: device.id });
    expect(device_health_metrics).toHaveLength(1);
  });

  it('should deny org_admin the function and writes to the health tables, but allow reading them', async () => {
    const { a, device, record } = await setup();
    await record(true, 0);
    await expectDenied(
      a.request(RECORD, { device: device.id, reachable: true, latency: 1, frame: true, at: minute(1) }),
      'record_device_health',
    );
    await expectDenied(
      a.request(`mutation($id: uuid!) { insert_device_events_one(object: {device_id: $id, kind: online}) { id } }`, { id: device.id }),
      'insert_device_events_one',
    );
    const rows = await a.request<{ device_health_metrics: unknown[]; device_events: unknown[] }>(
      `query($id: uuid!) { device_health_metrics(where: {device_id: {_eq: $id}}) { id } device_events { id } }`,
      { id: device.id },
    );
    expect(rows.device_health_metrics).toHaveLength(1);
  });

  it('should not be visible across organizations and use the covering indexes', async () => {
    const { orgB, other } = await createTwoOrgs();
    const b = asOrgAdmin(other.id, orgB.id);
    const rows = await b.request<{ device_health_metrics: unknown[] }>(`query { device_health_metrics { id } }`);
    expect(rows.device_health_metrics).toEqual([]);
    const idx = await runSqlRows(
      `select indexname from pg_indexes where schemaname='itap' and tablename in ('device_health_metrics','device_events') order by 1`,
    );
    expect(idx.map((r) => r.indexname)).toEqual(
      expect.arrayContaining([
        'device_health_metrics_organization_id_device_id_recorded_at_key',
        'device_events_organization_id_device_id_occurred_at_idx',
      ]),
    );
    await runSql('select 1');
  });
});
