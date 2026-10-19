import { syncTerminals, type TerminalSyncReport } from '../access/terminalSync.js';
import { perOrganizationCron } from './trackingCrons.js';
import { defineCronHandler, defineEventHandler } from './types.js';

const END_OVERRIDES = `
  mutation EndEmergencyOverrides($organization: uuid!, $at: timestamptz!) {
    end_emergency_overrides(args: { p_organization: $organization, p_at: $at }) { id }
  }
`;

/** Cron `end_emergency_overrides` (every minute): overrides past ends_at ended with the event (automatic restoration). */
export const endEmergencyOverrides = perOrganizationCron('end_emergency_overrides', END_OVERRIDES);

function summary(reports: TerminalSyncReport[]) {
  return {
    terminals: reports.length,
    synced: reports.filter((r) => r.result === 'synced').length,
    unreachable: reports.filter((r) => r.result === 'unreachable').length,
    failed: reports.filter((r) => r.result === 'failed').length,
  };
}

/**
 * Cron `sync_terminal_policies` (every minute, at scheduled_time): terminals behind the urgent epoch now, behind the
 * epoch lazily (last sync older than 15 minutes). Unreachable terminals are recorded and stay stale (not an error);
 * a failed push fails the run so Hasura retries it (only still-due terminals are pushed again).
 */
export const syncTerminalPolicies = defineCronHandler(async (payload, ctx) => {
  const at = new Date(payload.scheduled_time);
  if (Number.isNaN(at.getTime())) throw new Error(`Invalid scheduled_time: ${payload.scheduled_time}`);
  const result = summary(await syncTerminals(ctx.admin, { at }));
  if (result.failed > 0) throw new Error(`sync_terminal_policies: ${result.failed} of ${result.terminals} pushes failed`);
  return result;
});

/**
 * Event trigger `policy_urgent_epoch_bumped` (organization_settings.policy_urgent_epoch changed): pushes the
 * revocation to the organization's due terminals at once instead of waiting for the next cron run.
 */
export const policyUrgentEpochBumped = defineEventHandler(async (payload, ctx) => {
  const organizationId = payload.event.data.new?.organization_id;
  if (typeof organizationId !== 'string' || organizationId.length === 0) return { skipped: 'no_organization' };
  const result = summary(await syncTerminals(ctx.admin, { at: new Date(), organizationId }));
  if (result.failed > 0) throw new Error(`policy_urgent_epoch_bumped: ${result.failed} of ${result.terminals} pushes failed`);
  return { organization_id: organizationId, ...result };
});
