import { defineMutation } from '@burojs/core';
import { z } from 'zod';
import { type HasuraOperationEntry, hasuraOperation, rootOf } from '../../data/operations';
import { EMERGENCY_OVERRIDE_AREA_RESOURCE, EMERGENCY_OVERRIDE_RESOURCE, TERMINAL_POLICY_SYNC_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { type SqlRefusalText, sqlRefusals } from '../../data/sql-refusals';
import { ACCESS_BINDING } from './policy-ops';

const NOTHING = ' Nothing was changed.';
const MEMBER = 'Only an active member of the organization can start or end an override (your membership is suspended or expired).';

/** What `start_emergency_override` raises (and the table's CHECKs and guard behind it). */
export const START_OVERRIDE_REFUSALS: Readonly<Record<string, SqlRefusalText>> = {
  member_required: MEMBER + NOTHING,
  facility_not_found: 'The facility no longer exists (or is not visible to you).' + NOTHING,
  override_mode_invalid: 'Choose a mode: lock all, unlock all or evacuation.' + NOTHING,
  justification_required: 'Give a justification of at least 10 characters.' + NOTHING,
  emergency_overrides_justification_length: 'Give a justification of at least 10 characters.' + NOTHING,
  override_ends_at_invalid: 'The end must be in the future and at most 24 hours from now.' + NOTHING,
  emergency_overrides_ends_at_window: 'The end must be in the future and at most 24 hours from now.' + NOTHING,
  area_not_found: 'An area chosen is not in the facility (or no longer exists): choose areas of the facility, or none.' + NOTHING,
  emergency_override_function_only: 'Overrides are started only through Start override.' + NOTHING,
};

/** What `end_emergency_override` raises. */
export const END_OVERRIDE_REFUSALS: Readonly<Record<string, SqlRefusalText>> = {
  member_required: MEMBER + NOTHING,
  emergency_override_not_found: 'The override no longer exists (or is not visible to you).' + NOTHING,
  end_reason_required: 'Give the reason for ending the override early.' + NOTHING,
  emergency_override_ended: 'The override has already ended (someone ended it meanwhile, or it ran out): reload it.' + NOTHING,
  emergency_override_not_editable: 'An override only changes by being ended once.' + NOTHING,
};

export const startOverrideInput = z.object({
  facilityId: z.string().uuid(),
  mode: z.string(),
  justification: z.string(),
  endsAt: z.string(),
  areaIds: z.array(z.string().uuid()),
});
export const endOverrideInput = z.object({ overrideId: z.string().uuid(), reason: z.string() });

/** An override as both functions return it. */
export const overrideRow = z.object({ id: z.string(), mode: z.string(), ends_at: z.string(), ended_at: z.string().nullable() });

function firstRow(field: string) {
  return (data: unknown) => {
    const rows = rootOf(data, field);
    return Array.isArray(rows) ? (rows[0] ?? null) : null;
  };
}

export const startOverrideOperation: HasuraOperationEntry = hasuraOperation(
  ACCESS_BINDING,
  'startEmergencyOverride',
  {
    kind: 'mutation',
    document: `mutation StartEmergencyOverride($facility: uuid!, $mode: String!, $justification: String!, $endsAt: timestamptz!, $areas: _uuid) {
  start_emergency_override(
    args: { p_facility: $facility, p_mode: $mode, p_justification: $justification, p_ends_at: $endsAt, p_area_ids: $areas }
  ) { id mode ends_at ended_at }
}`,
    variables: (input) => {
      const { facilityId, mode, justification, endsAt, areaIds } = input as z.infer<typeof startOverrideInput>;
      // A Postgres array literal: Hasura takes `uuid[]` function arguments as text.
      return { facility: facilityId, mode, justification, endsAt, areas: `{${areaIds.join(',')}}` };
    },
    mapResult: firstRow('start_emergency_override'),
  },
  sqlRefusals(START_OVERRIDE_REFUSALS),
);

export const endOverrideOperation: HasuraOperationEntry = hasuraOperation(
  ACCESS_BINDING,
  'endEmergencyOverride',
  {
    kind: 'mutation',
    document: `mutation EndEmergencyOverride($override: uuid!, $reason: String!) {
  end_emergency_override(args: { p_override: $override, p_reason: $reason }) { id mode ends_at ended_at }
}`,
    variables: (input) => {
      const { overrideId, reason } = input as z.infer<typeof endOverrideInput>;
      return { override: overrideId, reason };
    },
    mapResult: firstRow('end_emergency_override'),
  },
  sqlRefusals(END_OVERRIDE_REFUSALS),
);

const OVERRIDE_EFFECTS = [EMERGENCY_OVERRIDE_RESOURCE, EMERGENCY_OVERRIDE_AREA_RESOURCE, TERMINAL_POLICY_SYNC_RESOURCE].map(
  (resource) => ({ resource }),
);

/**
 * Starts an override now: every covered door decides by it before any policy or grant until its
 * end; an event notifies supervisors and terminals are told at once (urgent epoch).
 */
export const startEmergencyOverride = defineMutation('itap:start-emergency-override', {
  binding: startOverrideOperation.binding,
  input: schema(startOverrideInput),
  output: schema(overrideRow.nullable()),
  effects: OVERRIDE_EFFECTS,
});

/** Ends an override before its planned end, with the reason; terminals are told. */
export const endEmergencyOverride = defineMutation('itap:end-emergency-override', {
  binding: endOverrideOperation.binding,
  input: schema(endOverrideInput),
  output: schema(overrideRow.nullable()),
  effects: OVERRIDE_EFFECTS,
});

export const OVERRIDE_OPERATIONS = [startOverrideOperation, endOverrideOperation];
export const OVERRIDE_MUTATIONS = [startEmergencyOverride, endEmergencyOverride];
