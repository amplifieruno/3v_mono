import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import { syncTerminalPolicies } from '../events/accessCrons.js';
import { defaultEventHandlers } from '../events/router.js';
import type { HasuraClient } from '../hasura/client.js';
import { stubTransport, syncTerminals, type SyncTarget } from './terminalSync.js';

const target = (device: string, reachable: boolean): SyncTarget => ({
  organization_id: 'org',
  facility_id: 'fac',
  device_id: device,
  synced_epoch: 1,
  epoch: 3,
  urgent_epoch: 3,
  urgent: true,
  reachable,
});

/** A fake Hasura client answering the three sync operations by name; records the record_terminal_sync variables. */
function fakeAdmin(targets: SyncTarget[], options: { failPayloadFor?: string; failRecord?: boolean } = {}) {
  const recorded: Record<string, unknown>[] = [];
  const request = vi.fn(async (query: string, variables: Record<string, unknown> = {}) => {
    if (query.includes('TerminalsDueForSync')) return { terminals_due_for_sync: targets };
    if (query.includes('TerminalPolicyPayload')) {
      if (variables.device === options.failPayloadFor) throw new Error('payload boom');
      return { terminal_policy_payload: [{ epoch: 4, checksum: 'abc', size_bytes: 120, payload: {} }] };
    }
    if (options.failRecord) throw new Error('record boom');
    recorded.push(variables);
    return { record_terminal_sync: [{ id: 'log' }] };
  });
  return { admin: { request } as unknown as HasuraClient, recorded };
}

describe('syncTerminals', () => {
  it('should deliver to reachable terminals, record unreachable ones, and use the payload epoch', async () => {
    const { admin, recorded } = fakeAdmin([target('t1', true), target('t2', false)]);
    const reports = await syncTerminals(admin, { at: new Date('2026-10-19T10:00:00Z') });
    expect(reports).toEqual([
      { device_id: 't1', organization_id: 'org', result: 'synced', epoch: 4 },
      { device_id: 't2', organization_id: 'org', result: 'unreachable', epoch: 4 },
    ]);
    expect(recorded[0]).toMatchObject({ device: 't1', epoch: 4, urgent: true, forced: false, result: 'synced', checksum: 'abc', size: 120, error: null });
    expect(recorded[1]).toMatchObject({ device: 't2', result: 'unreachable', error: 'unreachable' });
  });

  it('should record a failed payload as failed and keep going', async () => {
    const { admin, recorded } = fakeAdmin([target('t1', true), target('t2', true)], { failPayloadFor: 't1' });
    const reports = await syncTerminals(admin, { at: new Date(), force: true, organizationId: 'org' });
    expect(reports.map((r) => r.result)).toEqual(['failed', 'synced']);
    expect(recorded[0]).toMatchObject({ device: 't1', result: 'failed', epoch: 3, checksum: null, error: 'payload boom', forced: true });
  });

  it('should report failed when the attempt cannot be recorded, and the cron should then fail (Hasura retries)', async () => {
    const { admin } = fakeAdmin([target('t1', true)], { failRecord: true });
    expect((await syncTerminals(admin, { at: new Date() }))[0].result).toBe('failed');
    const payload = { id: 'c', name: 'sync_terminal_policies', scheduled_time: '2026-10-19T10:00:00Z', payload: {} };
    await expect(syncTerminalPolicies.handle(payload, { env: {} as Env, admin, idempotencyKey: 'k' })).rejects.toThrow(
      /1 of 1 pushes failed/,
    );
  });

  it('should treat only reachable terminals as delivered by the stub', async () => {
    const payload = { epoch: 1, checksum: 'x', size_bytes: 1, payload: {} };
    expect(await stubTransport(target('a', true), payload)).toEqual({ result: 'synced' });
    expect(await stubTransport(target('b', false), payload)).toEqual({ result: 'unreachable', error: 'unreachable' });
  });

  it('should register the crons and the urgent-bump trigger', () => {
    expect(defaultEventHandlers.sync_terminal_policies).toBe(syncTerminalPolicies);
    expect(defaultEventHandlers.end_emergency_overrides?.kind).toBe('cron');
    expect(defaultEventHandlers.policy_urgent_epoch_bumped?.kind).toBe('event');
  });
});
