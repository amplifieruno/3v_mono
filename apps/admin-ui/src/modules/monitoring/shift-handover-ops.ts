import { defineMutation } from '@burojs/core';
import { z } from 'zod';
import { MONITORING_BINDING } from '../../blocks/occupancy-now/occupancy-query';
import { hasuraOperation, rootOf } from '../../data/operations';
import {
  SHIFT_HANDOVER_INCIDENT_HISTORY_RESOURCE,
  SHIFT_HANDOVER_INCIDENT_RESOURCE,
  SHIFT_HANDOVER_RESOURCE,
} from '../../data/resource-names';
import { schema } from '../../data/schema';
import { type SqlRefusalText, sqlRefusals } from '../../data/sql-refusals';

const NOTHING = ' Nothing was changed.';
const NOT_FOUND = 'The handover no longer exists in this organization.' + NOTHING;

/** What `acknowledge_shift_handover` raises. */
export const ACKNOWLEDGE_HANDOVER_REFUSALS = {
  handover_not_found: NOT_FOUND,
  handover_not_recipient: 'Only the operator the shift is handed over to can acknowledge it.' + NOTHING,
} satisfies Record<string, SqlRefusalText>;

/** What `add_open_incidents_to_handover` raises. */
export const ADD_OPEN_INCIDENTS_REFUSALS = {
  handover_not_found: NOT_FOUND,
  handover_not_sender: 'Only the operator who wrote the handover can add incidents to it.' + NOTHING,
  handover_acknowledged: 'The handover is already acknowledged: its incidents can no longer change.' + NOTHING,
} satisfies Record<string, SqlRefusalText>;

export const handoverIdInput = z.object({ handoverId: z.string().uuid() });
export const acknowledgedHandover = z.object({ id: z.string(), acknowledged_at: z.string().nullable() });
export const addedIncidents = z.object({ added: z.number() });

const handoverOnly = (input: unknown) => ({ handover: (input as z.infer<typeof handoverIdInput>).handoverId });

/** `acknowledge_shift_handover(hasura_session, p_handover)`: the recipient confirms; a repeat answers it unchanged. */
export const acknowledgeShiftHandoverOperation = hasuraOperation(
  MONITORING_BINDING,
  'acknowledgeShiftHandover',
  {
    kind: 'mutation',
    document: `mutation AcknowledgeShiftHandover($handover: uuid!) {
  acknowledge_shift_handover(args: { p_handover: $handover }) { id acknowledged_at }
}`,
    variables: handoverOnly,
    mapResult: (data) => {
      const rows = rootOf(data, 'acknowledge_shift_handover');
      return Array.isArray(rows) ? (rows[0] ?? null) : null;
    },
  },
  sqlRefusals(ACKNOWLEDGE_HANDOVER_REFUSALS),
);

/**
 * `add_open_incidents_to_handover(hasura_session, p_handover)`: links every incident still being
 * handled that is not linked yet, answering the links it added (none on a repeat).
 */
export const addOpenIncidentsOperation = hasuraOperation(
  MONITORING_BINDING,
  'addOpenIncidentsToHandover',
  {
    kind: 'mutation',
    document: `mutation AddOpenIncidentsToHandover($handover: uuid!) {
  add_open_incidents_to_handover(args: { p_handover: $handover }) { id }
}`,
    variables: handoverOnly,
    mapResult: (data) => {
      const rows = rootOf(data, 'add_open_incidents_to_handover');
      return { added: Array.isArray(rows) ? rows.length : 0 };
    },
  },
  sqlRefusals(ADD_OPEN_INCIDENTS_REFUSALS),
);

/** Acknowledging changes the handover (list and page). */
export const acknowledgeShiftHandover = defineMutation('itap:acknowledge-shift-handover', {
  binding: acknowledgeShiftHandoverOperation.binding,
  input: schema(handoverIdInput),
  output: schema(acknowledgedHandover.nullable()),
  effects: [{ resource: SHIFT_HANDOVER_RESOURCE }],
});

/** What adding open incidents changes: the handover's incident links, editable and read only. */
export const HANDOVER_INCIDENT_EFFECTS = [
  { resource: SHIFT_HANDOVER_INCIDENT_RESOURCE },
  { resource: SHIFT_HANDOVER_INCIDENT_HISTORY_RESOURCE },
];

/** Adding open incidents changes the handover's incident links. */
export const addOpenIncidentsToHandover = defineMutation('itap:add-open-incidents-to-handover', {
  binding: addOpenIncidentsOperation.binding,
  input: schema(handoverIdInput),
  output: schema(addedIncidents),
  effects: HANDOVER_INCIDENT_EFFECTS,
});

/** The handover operations, for the module's registry. */
export const SHIFT_HANDOVER_OPERATIONS = [acknowledgeShiftHandoverOperation, addOpenIncidentsOperation];
