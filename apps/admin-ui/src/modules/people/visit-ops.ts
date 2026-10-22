import { defineMutation } from '@burojs/core';
import { z } from 'zod';
import { type HasuraOperationEntry, hasuraOperation, rootOf } from '../../data/operations';
import { VISIT_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { sqlRefusals } from '../../data/sql-refusals';
import { PEOPLE_BINDING } from './profile-activity';

const NOTHING = ' Nothing was changed.';

/** The refusals the three visit functions share (`lock_visit`, `visits_validate_transition`). */
const VISIT_REFUSALS = {
  visit_not_found: 'The visit no longer exists.' + NOTHING,
  visit_invalid_transition:
    'The visit’s status changed in the meantime (checked in, out or cancelled elsewhere, or marked no-show): reload it.' +
    NOTHING,
};

export const checkInVisitInput = z.object({
  visitId: z.string().uuid(),
  badgeNumber: z.string().nullable().optional(),
});

export const visitIdInput = z.object({ visitId: z.string().uuid() });

export const cancelVisitInput = z.object({
  visitId: z.string().uuid(),
  reason: z.string().nullable().optional(),
});

/** The visit as the functions return it. */
export const changedVisit = z.object({ id: z.string(), code: z.string(), status: z.string() });

/** Trimmed text, or `null` when blank. */
function textOrNull(value: string | null | undefined): string | null {
  const text = value?.trim() ?? '';
  return text === '' ? null : text;
}

/** One visit function (`SETOF itap.visits`) as a custom operation answering the changed visit. */
function visitOperation(
  operation: string,
  field: string,
  document: string,
  variables: (input: unknown) => Readonly<Record<string, unknown>>,
): HasuraOperationEntry {
  return hasuraOperation(
    PEOPLE_BINDING,
    operation,
    {
      kind: 'mutation',
      document,
      variables,
      mapResult: (data) => {
        const rows = rootOf(data, field);
        return Array.isArray(rows) ? (rows[0] ?? null) : null;
      },
    },
    sqlRefusals(VISIT_REFUSALS),
  );
}

/** `check_in_visit(hasura_session, p_visit, p_badge_number)`: scheduled → checked in, now. */
export const checkInVisitOperation = visitOperation(
  'checkInVisit',
  'check_in_visit',
  `mutation CheckInVisit($visit: uuid!, $badge: String) {
  check_in_visit(args: { p_visit: $visit, p_badge_number: $badge }) { id code status }
}`,
  (input) => {
    const { visitId, badgeNumber } = input as z.infer<typeof checkInVisitInput>;
    return { visit: visitId, badge: textOrNull(badgeNumber) };
  },
);

/** `check_out_visit(hasura_session, p_visit)`: checked in → checked out, now. */
export const checkOutVisitOperation = visitOperation(
  'checkOutVisit',
  'check_out_visit',
  `mutation CheckOutVisit($visit: uuid!) {
  check_out_visit(args: { p_visit: $visit }) { id code status }
}`,
  (input) => ({ visit: (input as z.infer<typeof visitIdInput>).visitId }),
);

/** `cancel_visit(hasura_session, p_visit, p_reason)`: scheduled → cancelled. */
export const cancelVisitOperation = visitOperation(
  'cancelVisit',
  'cancel_visit',
  `mutation CancelVisit($visit: uuid!, $reason: String) {
  cancel_visit(args: { p_visit: $visit, p_reason: $reason }) { id code status }
}`,
  (input) => {
    const { visitId, reason } = input as z.infer<typeof cancelVisitInput>;
    return { visit: visitId, reason: textOrNull(reason) };
  },
);

const effects = [{ resource: VISIT_RESOURCE }];

/** Checks a scheduled visit in now, with the badge handed out (kept when none is given). */
export const checkInVisit = defineMutation('itap:check-in-visit', {
  binding: checkInVisitOperation.binding,
  input: schema(checkInVisitInput),
  output: schema(changedVisit.nullable()),
  effects,
});

/** Checks a checked-in visit out now. */
export const checkOutVisit = defineMutation('itap:check-out-visit', {
  binding: checkOutVisitOperation.binding,
  input: schema(visitIdInput),
  output: schema(changedVisit.nullable()),
  effects,
});

/** Cancels a scheduled visit with the reason. */
export const cancelVisit = defineMutation('itap:cancel-visit', {
  binding: cancelVisitOperation.binding,
  input: schema(cancelVisitInput),
  output: schema(changedVisit.nullable()),
  effects,
});
