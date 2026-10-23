import type { TerminalStatus } from './terminal-ops';

/**
 * Where one terminal stands, as the sync status block says it:
 * - against the rule set (no override in view): `current` (holds the organization's epoch),
 *   `behind` (an older epoch, pushed with the next sync), `never` (never synced);
 * - against an override: `received` (synced since the override started, or since it ended),
 *   `waiting` (not yet);
 * - `unreachable` either way when the terminal is offline or unhealthy and not up to date.
 */
export type TerminalState = 'current' | 'behind' | 'never' | 'received' | 'waiting' | 'unreachable';

const instant = (value: string | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : at;
};

/**
 * A terminal's state. With `since` (an override's start, or its end once ended) a terminal has
 * the change when it synced at or after it: the database stamps both, and every sync carries the
 * full rule set of that moment, overrides included.
 */
export function terminalState(row: TerminalStatus, since: string | null = null): TerminalState {
  const from = instant(since);
  if (from !== null) {
    const synced = instant(row.synced_at);
    if (synced !== null && synced >= from) return 'received';
    return row.reachable ? 'waiting' : 'unreachable';
  }
  if (row.synced_epoch !== null && row.synced_epoch >= row.epoch) return 'current';
  if (!row.reachable) return 'unreachable';
  return row.synced_epoch === null ? 'never' : 'behind';
}

/** The terminals a view shows: one facility's, one device, or all. */
export function terminalsOf(rows: readonly TerminalStatus[], facilityId: string | null, deviceId: string | null): TerminalStatus[] {
  return rows.filter((row) => (facilityId === null || row.facility_id === facilityId) && (deviceId === null || row.device_id === deviceId));
}

/** How many terminals are in each state. */
export function countStates(rows: readonly TerminalStatus[], since: string | null): Readonly<Record<TerminalState, number>> {
  const counts: Record<TerminalState, number> = { current: 0, behind: 0, never: 0, received: 0, waiting: 0, unreachable: 0 };
  for (const row of rows) counts[terminalState(row, since)] += 1;
  return counts;
}

/** The badge tone of each state. */
export const STATE_VARIANT: Readonly<Record<TerminalState, 'success' | 'secondary' | 'warning' | 'destructive'>> = {
  current: 'success',
  received: 'success',
  behind: 'secondary',
  waiting: 'secondary',
  never: 'warning',
  unreachable: 'destructive',
};
