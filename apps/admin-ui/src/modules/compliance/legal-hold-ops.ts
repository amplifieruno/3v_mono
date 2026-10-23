import { defineMutation } from '@burojs/core';
import { z } from 'zod';
import { type HasuraOperationEntry, hasuraOperation, rootOf } from '../../data/operations';
import { LEGAL_HOLD_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { type SqlRefusalText, sqlRefusals } from '../../data/sql-refusals';
import { COMPLIANCE_BINDING } from './retention-policy-ops';

const NOTHING = ' Nothing was changed.';

/**
 * What the database refuses on a legal hold (`itap.legal_holds_timeline`, the table's CHECKs) and
 * on removing one of its targets (`legal_hold_targets_delete_guard`).
 */
export const LEGAL_HOLD_REFUSALS: Readonly<Record<string, SqlRefusalText>> = {
  legal_hold_start_immutable: 'The hold has started: its start can no longer move.' + NOTHING,
  legal_hold_ended: 'The hold has already ended: its dates are frozen and it cannot be reactivated.' + NOTHING,
  legal_hold_end_extension: 'A started hold’s end can only move earlier, never later or away.' + NOTHING,
  legal_hold_active: 'The hold is in force: what it covers cannot be removed until it ends.' + NOTHING,
  legal_holds_period: 'The end must be after the start.' + NOTHING,
  legal_holds_name_not_blank: 'Give the hold a name.' + NOTHING,
  legal_holds_reason_not_blank: 'Give the reason for the hold.' + NOTHING,
};

export const endHoldInput = z.object({ holdId: z.string().uuid() });

const holdRow = z.object({ id: z.string(), ends_at: z.string().nullable() });

export const endHoldOperation: HasuraOperationEntry = hasuraOperation(
  COMPLIANCE_BINDING,
  'endLegalHold',
  {
    kind: 'mutation',
    // The timeline trigger raises an end in the past to now(), so the client clock decides nothing.
    document: `mutation EndLegalHold($id: uuid!, $at: timestamptz!) {
  update_legal_holds_by_pk(pk_columns: { id: $id }, _set: { ends_at: $at }) { id ends_at }
}`,
    variables: (input) => ({ id: (input as z.infer<typeof endHoldInput>).holdId, at: new Date().toISOString() }),
    mapResult: (data) => rootOf(data, 'update_legal_holds_by_pk') ?? null,
  },
  sqlRefusals(LEGAL_HOLD_REFUSALS),
);

/** Ends a started hold now (`null`: it no longer exists). Refused on an ended hold. */
export const endLegalHold = defineMutation('itap:end-legal-hold', {
  binding: endHoldOperation.binding,
  input: schema(endHoldInput),
  output: schema(holdRow.nullable()),
  effects: [{ resource: LEGAL_HOLD_RESOURCE }],
});
