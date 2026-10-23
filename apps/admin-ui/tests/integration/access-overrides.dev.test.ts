import {
  type DataProvider,
  type MutationContext,
  type QueryContext,
  createMutationDescriptor,
  createQueryDescriptor,
} from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createItapHasuraProvider } from '../../src/data/provider';
import { EMERGENCY_OVERRIDE_RESOURCE, TERMINAL_POLICY_SYNC_RESOURCE } from '../../src/data/resource-names';
import { ACCESS_BINDING } from '../../src/modules/access/policy-ops';
import type { PublishOutput, TerminalStatus } from '../../src/modules/access/terminal-ops';
import { terminalState, terminalsOf } from '../../src/modules/access/terminal-sync-format';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, NOVA_NAME, devAdminSecret, signInDev } from '../support/dev-stack';
import { offsetPage } from '../support/pagination';

/**
 * An emergency override of Nova Tower through the console's provider, as `org_admin`: a short
 * justification and an end beyond 24 hours are refused; an unlock limited to one area starts,
 * reads active, and every reachable terminal of the facility picks it up (the urgent push of the
 * `policy_urgent_epoch_bumped` trigger, bounded wait); ending it needs a reason, the end is kept,
 * a second end is refused, and every reachable terminal picks up the end while the offline one
 * reads unreachable (Review Focus 3); the sync log has a row per terminal; "Publish policy to
 * terminals" answers per terminal. Cleanup with the admin secret under the retention context: the
 * override, its areas, its events and what they fanned out, its audit rows and this test's sync
 * log rows (device sync state and the policy epoch counters stay advanced).
 */

const IDENTITY = { providerId: 'hasura', sessionKey: 'access-overrides-dev-test', scopeKey: null, bindingRevision: '1' } as const;
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

/** How long the urgent push may take (the trigger answers within seconds; the cron is the safety net). */
const SYNC_WAIT_MS = 90_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

describe.skipIf(!DEV_STACK_ENABLED)('emergency overrides and terminal sync against the dev stack (Nova Tower)', () => {
  let provider: DataProvider;
  let token: () => Promise<string | null>;
  let facility = '';
  let area = '';
  let overrideId = '';
  const startedAt = new Date().toISOString();

  const custom = async (kind: 'mutations' | 'queries', operation: string, input: Row): Promise<unknown> => {
    const descriptor = { ...IDENTITY, kind: 'custom', ref: { namespace: 'default', id: operation }, resource: ACCESS_BINDING, operation, input };
    return kind === 'mutations'
      ? provider.mutations?.custom?.(createMutationDescriptor(descriptor as never) as never, mutationContext())
      : provider.queries?.custom?.(createQueryDescriptor(descriptor as never) as never, queryContext());
  };
  const list = async (resource: string, filter: Row, pagination: Row = offsetPage(1, 50)): Promise<Row[]> => {
    const { data } = (await provider.queries?.list?.(
      createQueryDescriptor({ ...IDENTITY, kind: 'list', ref: { namespace: 'default', id: resource }, resource, pagination, filter } as never) as never,
      queryContext(),
    )) as { data: Row[] };
    return data;
  };
  const one = async (resource: string, id: string): Promise<Row> => {
    const { data } = (await provider.queries?.one?.(
      createQueryDescriptor({ ...IDENTITY, kind: 'one', ref: { namespace: 'default', id: resource }, resource, id } as never) as never,
      queryContext(),
    )) as { data: Row };
    return data;
  };
  const terminals = async (): Promise<TerminalStatus[]> =>
    terminalsOf((await custom('queries', 'terminalSyncStatus', {})) as TerminalStatus[], facility, null);
  /** Waits until every reachable terminal of the facility synced at or after `since`. */
  const reachableReceived = async (since: string): Promise<TerminalStatus[]> => {
    const until = Date.now() + SYNC_WAIT_MS;
    for (;;) {
      const rows = await terminals();
      const waiting = rows.filter((row) => row.reachable && terminalState(row, since) !== 'received');
      if (waiting.length === 0 || Date.now() > until) return rows;
      await sleep(2_000);
    }
  };
  const sql = async (statement: string): Promise<{ result?: string[][] }> => {
    const response = await fetch(DEV_GRAPHQL.replace('/v1/graphql', '/v2/query'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': devAdminSecret() },
      body: JSON.stringify({ type: 'run_sql', args: { source: 'default', sql: statement } }),
    });
    expect(response.ok, await response.clone().text()).toBe(true);
    return (await response.json()) as { result?: string[][] };
  };
  const graphql = async (query: string): Promise<Row> => {
    const response = await fetch(DEV_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ query }),
    });
    const body = (await response.json()) as { data?: Row; errors?: unknown[] };
    expect(body.errors, JSON.stringify(body.errors)).toBeUndefined();
    return body.data ?? {};
  };

  beforeAll(async () => {
    const auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    token = () => auth.getToken();
    provider = createItapHasuraProvider(token, DEV_GRAPHQL);
    const data = await graphql(`{ facilities(where: { name: { _eq: "Nova Tower" } }) { id areas(order_by: { name: asc }, limit: 1) { id } } }`);
    const [nova] = data.facilities as { id: string; areas: { id: string }[] }[];
    facility = nova?.id ?? '';
    area = nova?.areas[0]?.id ?? '';
    expect(facility).not.toBe('');
    expect(area).not.toBe('');
  }, 60_000);

  afterAll(async () => {
    if (overrideId === '') return;
    const events = `(select e.id from itap.events e where e.dedup_key in ('override:${overrideId}:started', 'override:${overrideId}:ended'))`;
    // The area rows' ids, read first: deleting them writes audit rows keyed by them.
    const areaRows = (await sql(`select id from itap.emergency_override_areas where override_id = '${overrideId}'`)).result ?? [];
    const audited = [overrideId, ...areaRows.slice(1).map(([id]) => id)].map((id) => `'${id}'`).join(', ');
    await sql(
      [
        "select set_config('itap.retention_context', 'on', true)",
        `delete from itap.notification_deliveries where event_id in ${events}`,
        `delete from itap.user_notifications where event_id in ${events}`,
        `delete from itap.webhook_deliveries where event_id in ${events}`,
        `delete from itap.incident_events where event_id in ${events}`,
        `delete from itap.events where id in ${events}`,
        `delete from itap.emergency_override_areas where override_id = '${overrideId}'`,
        `delete from itap.emergency_overrides where id = '${overrideId}'`,
        `delete from itap.terminal_policy_syncs where facility_id = '${facility}' and created_at >= '${startedAt}'`,
        `delete from itap.audit_log where entity in ('emergency_overrides', 'emergency_override_areas') and entity_id in (${audited})`,
      ].join('; '),
    );
    const left = await sql(
      `select (select count(*) from itap.emergency_overrides where id = '${overrideId}')
         + (select count(*) from itap.events where dedup_key like 'override:${overrideId}:%')
         + (select count(*) from itap.audit_log where entity in ('emergency_overrides', 'emergency_override_areas') and entity_id in (${audited}))`,
    );
    expect(left.result?.[1]?.[0]).toBe('0');
  }, 60_000);

  it('should refuse a short justification and an end beyond 24 hours', async () => {
    const input = { facilityId: facility, mode: 'unlock_all', areaIds: [area] };
    await expect(custom('mutations', 'startEmergencyOverride', { ...input, justification: 'too short', endsAt: minutesFromNow(10) })).rejects.toMatchObject({
      code: 'justification_required',
    });
    await expect(
      custom('mutations', 'startEmergencyOverride', { ...input, justification: 'Dev test: delivery bay', endsAt: minutesFromNow(25 * 60) }),
    ).rejects.toMatchObject({ code: 'override_ends_at_invalid' });
  }, 30_000);

  it('should start, end early with a reason, and show every reachable terminal picking up both', async () => {
    const started = (await custom('mutations', 'startEmergencyOverride', {
      facilityId: facility,
      mode: 'unlock_all',
      justification: '  Dev test: unlock the first area for a delivery  ',
      endsAt: minutesFromNow(10),
      areaIds: [area],
    })) as Row;
    overrideId = String(started.id);
    const stored = await one(EMERGENCY_OVERRIDE_RESOURCE, overrideId);
    expect(stored).toMatchObject({ facility_id: facility, mode: 'unlock_all', justification: 'Dev test: unlock the first area for a delivery', ended_at: null });
    const active = await list(EMERGENCY_OVERRIDE_RESOURCE, { and: [{ field: 'ended_at', op: 'isNull' }, { field: 'facility_id', op: 'eq', value: facility }] });
    expect(active.map((row) => row.id)).toContain(overrideId);

    const afterStart = await reachableReceived(String(stored.started_at));
    expect(afterStart.length).toBeGreaterThan(1);
    expect(afterStart.filter((row) => row.reachable).every((row) => terminalState(row, String(stored.started_at)) === 'received')).toBe(true);

    await expect(custom('mutations', 'endEmergencyOverride', { overrideId, reason: '  ' })).rejects.toMatchObject({ code: 'end_reason_required' });
    expect(await custom('mutations', 'endEmergencyOverride', { overrideId, reason: 'Delivery done' })).toMatchObject({ id: overrideId });
    const ended = await one(EMERGENCY_OVERRIDE_RESOURCE, overrideId);
    expect(ended).toMatchObject({ end_reason: 'Delivery done', ended_at: expect.any(String), ended_by: expect.any(String) });
    await expect(custom('mutations', 'endEmergencyOverride', { overrideId, reason: 'Again' })).rejects.toMatchObject({ code: 'emergency_override_ended' });

    // Ending an unlock is urgent: the trigger pushes it to every reachable terminal within seconds.
    const endedAt = String(ended.ended_at);
    const afterEnd = await reachableReceived(endedAt);
    const states = afterEnd.map((row) => [row.device_name, terminalState(row, endedAt)] as const);
    expect(states.filter(([, state]) => state === 'received').length).toBeGreaterThan(1);
    expect(states.every(([, state]) => state === 'received' || state === 'unreachable'), JSON.stringify(states)).toBe(true);
    const log = await list(TERMINAL_POLICY_SYNC_RESOURCE, { and: [{ field: 'facility_id', op: 'eq', value: facility }, { field: 'created_at', op: 'gte', value: endedAt }] }, { kind: 'cursor', limit: 100 });
    const logged = new Set(log.filter((row) => row.result === 'synced').map((row) => row.device_id));
    for (const row of afterEnd.filter((r) => r.reachable)) expect(logged.has(row.device_id), row.device_name).toBe(true);
  }, 240_000);

  it('should publish to the facility’s terminals and answer per terminal', async () => {
    const answer = (await custom('mutations', 'publishPolicyToTerminals', { facilityId: facility })) as PublishOutput;
    const facilityTerminals = await terminals();
    expect(answer.terminals.map((row) => row.device_id).sort()).toEqual(facilityTerminals.map((row) => row.device_id).sort());
    for (const row of answer.terminals) {
      const terminal = facilityTerminals.find((t) => t.device_id === row.device_id);
      expect(row.result, terminal?.device_name).toBe(terminal?.reachable ? 'synced' : 'unreachable');
    }
    await expect(custom('mutations', 'publishPolicyToTerminals', { facilityId: '00000000-0000-4000-8000-000000000000' })).rejects.toMatchObject({
      code: 'facility_not_found',
    });
  }, 60_000);
});
