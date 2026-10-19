import type { HasuraClient } from '../../../src/hasura/client.js';
import { accessWorld, type AccessWorld } from './access.js';
import { asAdmin } from './clients.js';
import { createDevice } from './facilities.js';
import { callFn, insertOne } from './operations.js';
import { cronPayload, postTrigger } from './sending.js';
import { runSql, runSqlRows } from './sql.js';

/** Helpers for slice 8 task 4: emergency overrides, terminal distribution, simulation, analytics. */

export type Override = {
  id: string;
  mode: string;
  facility_id: string;
  justification: string;
  started_by: string | null;
  started_at: string;
  ends_at: string;
  ended_by: string | null;
  ended_at: string | null;
  end_reason: string | null;
};
export const OVERRIDE_FIELDS = 'id mode facility_id justification started_by started_at ends_at ended_by ended_at end_reason';

export const inMinutes = (m: number): string => new Date(Date.now() + m * 60_000).toISOString();

export function startOverride(
  client: HasuraClient,
  facility: string,
  mode: string,
  extra: { justification?: string; ends_at?: string; area_ids?: string[] } = {},
): Promise<Override> {
  return callFn<Override>(
    client,
    'start_emergency_override',
    {
      p_facility: facility,
      p_mode: mode,
      p_justification: extra.justification ?? 'Fire alarm drill on floor 2',
      p_ends_at: extra.ends_at ?? inMinutes(60),
      ...(extra.area_ids ? { p_area_ids: `{${extra.area_ids.join(',')}}` } : {}),
    },
    OVERRIDE_FIELDS,
  );
}

export const endOverrideFn = (client: HasuraClient, id: string, reason: string | null): Promise<Override> =>
  callFn<Override>(client, 'end_emergency_override', { p_override: id, p_reason: reason }, OVERRIDE_FIELDS);

/** The cron's SQL function for one organization (admin secret). */
export async function endExpired(org: string, at: string = new Date().toISOString()): Promise<string[]> {
  const data = await asAdmin().request<{ end_emergency_overrides: { id: string }[] }>(
    `mutation($o: uuid!, $at: timestamptz!) { end_emergency_overrides(args: {p_organization: $o, p_at: $at}) { id } }`,
    { o: org, at },
  );
  return data.end_emergency_overrides.map((r) => r.id);
}

export async function eventsOf(org: string, types: string[]): Promise<{ event_type: string; dedup_key: string; payload: Record<string, unknown>; occurred_at: string }[]> {
  const rows = await runSqlRows(`select event_type, dedup_key, payload::text as payload, occurred_at from itap.events
    where organization_id = '${org}' and event_type in (${types.map((t) => `'${t}'`).join(',')}) order by created_at, event_type`);
  return rows.map((r) => ({
    event_type: r.event_type ?? '',
    dedup_key: r.dedup_key ?? '',
    payload: JSON.parse(r.payload ?? '{}') as Record<string, unknown>,
    occurred_at: r.occurred_at ?? '',
  }));
}

// ---- terminals ----

export type TerminalWorld = AccessWorld & { online: string; offline: string; unbound: string; camera: string };

/** accessWorld + an online and an offline (connection_error) terminal at the door, an unbound terminal, a camera. */
export async function terminalWorld(): Promise<TerminalWorld> {
  const w = await accessWorld();
  const online = await createDevice(w.a, w.facility.id, { device_type: 'access_terminal', name: 'Terminal online' });
  const offline = await createDevice(w.a, w.facility.id, {
    device_type: 'access_terminal',
    name: 'Terminal offline',
    status: 'connection_error',
  });
  const unbound = await createDevice(w.a, w.facility.id, { device_type: 'access_terminal', name: 'Spare terminal' });
  const camera = await createDevice(w.a, w.facility.id, { name: 'Door camera' });
  for (const [device, role] of [
    [online.id, 'terminal'],
    [offline.id, 'terminal'],
    [camera.id, 'camera'],
  ]) {
    await insertOne(w.a, 'access_point_devices', {
      facility_id: w.facility.id,
      access_point_id: w.door.id,
      device_id: device,
      role,
    });
  }
  return { ...w, online: online.id, offline: offline.id, unbound: unbound.id, camera: camera.id };
}

export type Payload = {
  device_id: string;
  epoch: number;
  urgent_epoch: number;
  checksum: string;
  size_bytes: number;
  payload: Record<string, unknown> & {
    versions: { version_id: string }[];
    grants: { grant_id: string; valid_until: string }[];
    overrides: { override_id: string; ends_at: string }[];
    segments: { segment_id: string; member_ids: string[] }[];
  };
};

export async function terminalPayload(device: string): Promise<Payload | undefined> {
  const data = await asAdmin().request<{ terminal_policy_payload: Payload[] }>(
    `query($d: uuid!) { terminal_policy_payload(args: {p_device: $d}) { device_id epoch urgent_epoch checksum size_bytes payload } }`,
    { d: device },
  );
  return data.terminal_policy_payload[0];
}

export type SyncStatus = {
  device_id: string;
  reachable: boolean;
  synced_epoch: number | null;
  sync_error: string | null;
  epoch: number;
  urgent_epoch: number;
  epoch_lag: number;
  urgent_pending: boolean;
  seconds_since_urgent: number | null;
  bound_seconds: number;
  within_bound: boolean;
};

export async function syncStatus(client: HasuraClient): Promise<Record<string, SyncStatus>> {
  const data = await client.request<{ terminal_sync_status: SyncStatus[] }>(`query { terminal_sync_status {
    device_id reachable synced_epoch sync_error epoch urgent_epoch epoch_lag urgent_pending seconds_since_urgent
    bound_seconds within_bound } }`);
  return Object.fromEntries(data.terminal_sync_status.map((r) => [r.device_id, r]));
}

export async function deviceSync(device: string): Promise<{ synced: number | null; error: string | null; at: string | null }> {
  const [row] = await runSqlRows(`select policy_version_synced, policy_sync_error, policy_synced_at from itap.devices where id = '${device}'`);
  const nul = (v: string | null): string | null => (v === null || v === 'NULL' ? null : v);
  const synced = nul(row.policy_version_synced);
  return { synced: synced === null ? null : Number(synced), error: nul(row.policy_sync_error), at: nul(row.policy_synced_at) };
}

export async function syncLog(device: string): Promise<{ epoch: number; urgent: boolean; forced: boolean; result: string; checksum: string | null }[]> {
  const rows = await runSqlRows(`select epoch, urgent, forced, result, checksum from itap.terminal_policy_syncs
    where device_id = '${device}' order by created_at, id`);
  return rows.map((r) => ({
    epoch: Number(r.epoch),
    urgent: r.urgent === 't',
    forced: r.forced === 't',
    result: r.result ?? '',
    checksum: r.checksum === 'NULL' ? null : r.checksum,
  }));
}

/** Runs the sync_terminal_policies cron handler once (as Hasura would deliver it). */
export async function runSyncCron(): Promise<Record<string, unknown>> {
  const res = await postTrigger('sync_terminal_policies', cronPayload('sync_terminal_policies'));
  if (res.status !== 200) throw new Error(`sync_terminal_policies: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

export async function publishToTerminals(
  client: HasuraClient,
  facility?: string,
): Promise<{ device_id: string; result: string; epoch: number }[]> {
  const data = await client.request<{ publish_policy_to_terminals: { device_id: string; result: string; epoch: number }[] }>(
    `mutation($f: uuid) { publish_policy_to_terminals(facility_id: $f) { device_id result epoch } }`,
    { f: facility ?? null },
  );
  return data.publish_policy_to_terminals;
}

/** Moves the organization's urgent epoch timestamp into the past (simulates elapsed time). */
export async function ageUrgentEpoch(org: string, seconds: number): Promise<void> {
  await runSql(`update itap.organization_settings set policy_urgent_at = now() - interval '${seconds} seconds'
    where organization_id = '${org}'`);
}

export { accessWorld };
