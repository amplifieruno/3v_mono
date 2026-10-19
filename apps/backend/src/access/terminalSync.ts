import type { HasuraClient } from '../hasura/client.js';

/**
 * Policy distribution to access terminals (slice 8, design §8.5, SA_5 §2.1.4). Real state, stubbed transport: SQL
 * decides which terminals are due (itap.terminals_due_for_sync), builds each payload (itap.terminal_policy_payload),
 * the stub "delivers" it, and SQL records the attempt (itap.record_terminal_sync: devices.policy_version_synced /
 * policy_synced_at / policy_sync_error + the terminal_policy_syncs log).
 */

export type SyncTarget = {
  organization_id: string;
  facility_id: string;
  device_id: string;
  synced_epoch: number | null;
  epoch: number;
  urgent_epoch: number;
  urgent: boolean;
  reachable: boolean;
};

export type TerminalPayload = { epoch: number; checksum: string; size_bytes: number; payload: unknown };

export type SyncResult = 'synced' | 'unreachable' | 'failed';
export type DeliveryOutcome = { result: SyncResult; error?: string };

/** The transport to a terminal. The demo stub delivers to every reachable terminal and nothing to the others. */
export type TerminalTransport = (target: SyncTarget, payload: TerminalPayload) => Promise<DeliveryOutcome>;

export const stubTransport: TerminalTransport = async (target) =>
  target.reachable ? { result: 'synced' } : { result: 'unreachable', error: 'unreachable' };

export type TerminalSyncReport = { device_id: string; organization_id: string; result: SyncResult; epoch: number };

export type SyncOptions = {
  /** Scheduled time of the run (lazy cut-off: last sync older than 15 minutes before it). */
  at: Date;
  /** Every terminal of `organizationId` instead of the due ones. */
  force?: boolean;
  organizationId?: string;
  facilityId?: string;
  transport?: TerminalTransport;
};

const DUE = `
  query TerminalsDueForSync($at: timestamptz!, $force: Boolean!, $org: uuid, $facility: uuid) {
    terminals_due_for_sync(args: { p_at: $at, p_force: $force, p_organization: $org, p_facility: $facility }) {
      organization_id facility_id device_id synced_epoch epoch urgent_epoch urgent reachable
    }
  }
`;
const PAYLOAD = `
  query TerminalPolicyPayload($device: uuid!) {
    terminal_policy_payload(args: { p_device: $device }) { epoch checksum size_bytes payload }
  }
`;
const RECORD = `
  mutation RecordTerminalSync(
    $device: uuid!, $epoch: bigint!, $urgent: Boolean!, $forced: Boolean!, $result: String!, $checksum: String,
    $size: Int, $duration: numeric, $error: String
  ) {
    record_terminal_sync(args: {
      p_device: $device, p_epoch: $epoch, p_urgent: $urgent, p_forced: $forced, p_result: $result,
      p_checksum: $checksum, p_size_bytes: $size, p_duration_ms: $duration, p_error: $error
    }) { id }
  }
`;

function message(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : 'delivery failed';
}

/**
 * Pushes the current payload to each due (or, forced, every) terminal and records each attempt. One terminal's
 * failure does not stop the others; the caller sees it as result 'failed' (recorded when possible).
 */
export async function syncTerminals(admin: HasuraClient, options: SyncOptions): Promise<TerminalSyncReport[]> {
  const transport = options.transport ?? stubTransport;
  const force = options.force ?? false;
  const { terminals_due_for_sync: targets } = await admin.request<{ terminals_due_for_sync: SyncTarget[] }>(DUE, {
    at: options.at.toISOString(),
    force,
    org: options.organizationId ?? null,
    facility: options.facilityId ?? null,
  });
  const reports: TerminalSyncReport[] = [];
  for (const target of targets) {
    const started = performance.now();
    let epoch = target.epoch;
    let payload: TerminalPayload | undefined;
    let outcome: DeliveryOutcome;
    try {
      const data = await admin.request<{ terminal_policy_payload: TerminalPayload[] }>(PAYLOAD, { device: target.device_id });
      payload = data.terminal_policy_payload[0];
      if (!payload) throw new Error('terminal_not_found');
      epoch = payload.epoch;
      outcome = await transport(target, payload);
    } catch (error) {
      outcome = { result: 'failed', error: message(error) };
    }
    const duration = Math.round((performance.now() - started) * 1000) / 1000;
    try {
      await admin.request(RECORD, {
        device: target.device_id,
        epoch,
        urgent: target.urgent,
        forced: force,
        result: outcome.result,
        checksum: payload?.checksum ?? null,
        size: payload?.size_bytes ?? null,
        duration,
        error: outcome.error ?? null,
      });
    } catch {
      outcome = { result: 'failed', error: 'record_failed' };
    }
    reports.push({ device_id: target.device_id, organization_id: target.organization_id, result: outcome.result, epoch });
  }
  return reports;
}
