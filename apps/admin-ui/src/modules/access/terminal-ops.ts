import { defineMutation, defineQuery } from '@burojs/core';
import { z } from 'zod';
import type { ActionRefusalReader } from '../../data/action-refusals';
import { type HasuraOperationEntry, hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { ACCESS_DECISION_RESOURCE, DEVICE_RESOURCE, TERMINAL_POLICY_SYNC_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { ACCESS_BINDING } from './policy-ops';

/** One access terminal's convergence (`itap.terminal_sync_status`): where it stands against the rule set. */
export const terminalStatusRow = z.object({
  device_id: z.string(),
  device_name: z.string(),
  facility_id: z.string(),
  status: z.string(),
  health_status: z.string(),
  reachable: z.boolean(),
  synced_epoch: z.number().nullable(),
  synced_at: z.string().nullable(),
  sync_error: z.string().nullable(),
  epoch: z.number(),
  urgent_epoch: z.number(),
  epoch_lag: z.number(),
  urgent_pending: z.boolean(),
  seconds_since_urgent: z.number().nullable(),
  bound_seconds: z.number(),
  within_bound: z.boolean(),
});

export type TerminalStatus = z.infer<typeof terminalStatusRow>;

const STATUS_COLUMNS = `device_id device_name facility_id status health_status reachable synced_epoch synced_at sync_error
    epoch urgent_epoch epoch_lag urgent_pending seconds_since_urgent bound_seconds within_bound`;

const parseRows = (value: unknown): TerminalStatus[] =>
  Array.isArray(value) ? value.flatMap((row) => {
    const parsed = terminalStatusRow.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  }) : [];

export const terminalSyncStatusOperation = hasuraOperation(ACCESS_BINDING, 'terminalSyncStatus', {
  kind: 'query',
  document: `query TerminalSyncStatus {
  terminal_sync_status {
    ${STATUS_COLUMNS}
  }
}`,
  variables: () => ({}),
  mapResult: (data) => parseRows(rootOf(data, 'terminal_sync_status')),
});

/**
 * Every access terminal of the organization with its sync state (a few per facility): the epoch
 * it holds against the organization's, whether an urgent change is still pending and whether it
 * is within the revocation bound. The views narrow it to a facility or a device.
 */
export const terminalSyncStatus = defineQuery('itap:terminal-sync-status', {
  binding: terminalSyncStatusOperation.binding,
  input: schema(z.object({})),
  output: schema(z.array(terminalStatusRow)),
  reads: [DEVICE_RESOURCE, TERMINAL_POLICY_SYNC_RESOURCE].map(resourceByName),
});

/** One push of "Publish policy to terminals" (`TerminalPublishResult`); `skipped` is not recorded. */
export const publishResultRow = z.object({ device_id: z.string(), result: z.string(), epoch: z.number() });
export const publishOutput = z.object({ terminals: z.array(publishResultRow) });
export type PublishOutput = z.infer<typeof publishOutput>;

const publishInput = z.object({ facilityId: z.string().uuid().nullable() });

/** What the backend answers before it pushes anything. */
export const PUBLISH_REFUSALS: Readonly<Record<string, string>> = {
  facility_not_found: 'The facility no longer exists (or is not visible to you). Nothing was pushed.',
  no_organization: 'Your session has no organization. Sign in again. Nothing was pushed.',
};

/** The refusal reader of `publish_policy_to_terminals` (form-level issues). */
export const publishRefusals: ActionRefusalReader = ({ code }) => {
  const text = PUBLISH_REFUSALS[code];
  return text === undefined ? null : [{ code, message: text, path: [] }];
};

export const publishOperation: HasuraOperationEntry = hasuraOperation(
  ACCESS_BINDING,
  'publishPolicyToTerminals',
  {
    kind: 'mutation',
    document: `mutation PublishPolicyToTerminals($facility: uuid) {
  publish_policy_to_terminals(facility_id: $facility) { device_id result epoch }
}`,
    variables: (input) => ({ facility: (input as z.infer<typeof publishInput>).facilityId }),
    mapResult: (data) => {
      const rows = z.array(publishResultRow).safeParse(rootOf(data, 'publish_policy_to_terminals'));
      return { terminals: rows.success ? rows.data : [] };
    },
  },
  publishRefusals,
);

/**
 * Pushes the current rule set to every access terminal of the organization (or of one facility)
 * now, whatever their epoch; answers each terminal's result. Unreachable ones keep the older rule
 * set and are tried again by the minute sync.
 */
export const publishPolicyToTerminals = defineMutation('itap:publish-policy-to-terminals', {
  binding: publishOperation.binding,
  input: schema(publishInput),
  output: schema(publishOutput),
  effects: [{ resource: DEVICE_RESOURCE }, { resource: TERMINAL_POLICY_SYNC_RESOURCE }],
  // Safe to send again: a second push delivers the same rule set (one more log row per terminal).
  replay: 'once-after-auth-refresh',
});

/** The newest decision at a door, as the database stamped it (a server-clock baseline). */
export const latestDecision = z.object({ id: z.string(), decided_at: z.string() });
export type LatestDecision = z.infer<typeof latestDecision>;

const latestInput = z.object({ accessPointId: z.string().uuid() });

export const latestDecisionOperation = hasuraOperation(ACCESS_BINDING, 'latestDoorDecision', {
  kind: 'query',
  document: `query LatestDoorDecision($point: uuid!) {
  access_decisions(where: { access_point_id: { _eq: $point } }, order_by: [{ decided_at: desc }, { id: desc }], limit: 1) {
    id decided_at
  }
}`,
  variables: (input) => ({ point: (input as z.infer<typeof latestInput>).accessPointId }),
  mapResult: (data) => {
    const rows = z.array(latestDecision).safeParse(rootOf(data, 'access_decisions'));
    return { latest: rows.success ? (rows.data[0] ?? null) : null };
  },
});

/**
 * The newest decision at a door when "Test access" opens: the lost-answer check compares the
 * database's own timestamps with it, never the browser's clock.
 */
export const latestDoorDecision = defineQuery('itap:latest-door-decision', {
  binding: latestDecisionOperation.binding,
  input: schema(latestInput),
  output: schema(z.object({ latest: latestDecision.nullable() })),
  reads: [resourceByName(ACCESS_DECISION_RESOURCE)],
});

export const TERMINAL_OPERATIONS = [terminalSyncStatusOperation, publishOperation, latestDecisionOperation];
export const TERMINAL_QUERIES = [terminalSyncStatus, publishPolicyToTerminals, latestDoorDecision];
