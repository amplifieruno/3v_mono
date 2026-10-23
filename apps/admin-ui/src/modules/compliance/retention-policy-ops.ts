import { defineMutation } from '@burojs/core';
import { z } from 'zod';
import { type HasuraOperationEntry, hasuraOperation, rootOf } from '../../data/operations';
import { RETENTION_POLICY_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { type SqlRefusalText, sqlRefusals } from '../../data/sql-refusals';

/** The registry key the compliance operations are bound under. */
export const COMPLIANCE_BINDING = 'compliance';

const NOTHING = ' Nothing was changed.';

/**
 * What the database refuses on a retention policy: the class floor and range
 * (`retention_policies_retain_days`), an action the class does not take
 * (`retention_policies_action_valid`), a facility on a class without one
 * (`retention_policies_facility_dimension`), a second active policy for the same class and
 * facility (`retention_policies_active_scope_key`). Hasura quotes the constraint's name, so the
 * reader matches it (`sqlRefusals`).
 */
export const RETENTION_POLICY_REFUSALS: Readonly<Record<string, SqlRefusalText>> = {
  retention_policies_retain_days:
    'The retention is out of range for this class: the audit log and face authentication attempts are kept at least 365 days, every other class at least 1 day, and no class more than 36 500 days.' +
    NOTHING,
  retention_policies_action_valid: 'This class does not take that action: choose one the class accepts (Delete is accepted by every class).' + NOTHING,
  retention_policies_facility_dimension:
    'Only classes whose rows belong to one facility (detections, locations, sessions, events, incidents, access decisions, terminal syncs, statistics) take a facility-specific policy.' +
    NOTHING,
  retention_policies_active_scope_key:
    'Another active policy already covers this class for the same facility (or the whole organization): deactivate it first, then activate this one.' +
    NOTHING,
};

export const setPolicyActiveInput = z.object({ policyId: z.string().uuid(), active: z.boolean() });

const policyRow = z.object({ id: z.string(), is_active: z.boolean() });

export const setPolicyActiveOperation: HasuraOperationEntry = hasuraOperation(
  COMPLIANCE_BINDING,
  'setRetentionPolicyActive',
  {
    kind: 'mutation',
    document: `mutation SetRetentionPolicyActive($id: uuid!, $active: Boolean!) {
  update_retention_policies_by_pk(pk_columns: { id: $id }, _set: { is_active: $active }) { id is_active }
}`,
    variables: (input) => {
      const { policyId, active } = input as z.infer<typeof setPolicyActiveInput>;
      return { id: policyId, active };
    },
    mapResult: (data) => rootOf(data, 'update_retention_policies_by_pk') ?? null,
  },
  sqlRefusals(RETENTION_POLICY_REFUSALS),
);

/** Activates or deactivates a policy (`null`: it no longer exists). Idempotent. */
export const setRetentionPolicyActive = defineMutation('itap:set-retention-policy-active', {
  binding: setPolicyActiveOperation.binding,
  input: schema(setPolicyActiveInput),
  output: schema(policyRow.nullable()),
  effects: [{ resource: RETENTION_POLICY_RESOURCE }],
});

/** Why the database refuses to delete a policy: a record of processing names it as its retention. */
export const DELETE_POLICY_REFUSALS: Readonly<Record<string, SqlRefusalText>> = {
  processing_activities_retention_policy_fkey:
    'A processing activity names this policy as its retention: point the activity at another policy first, or deactivate this one instead. Nothing was deleted.',
};

export const deletePolicyInput = z.object({ policyId: z.string().uuid() });

export const deletePolicyOperation: HasuraOperationEntry = hasuraOperation(
  COMPLIANCE_BINDING,
  'deleteRetentionPolicy',
  {
    kind: 'mutation',
    document: `mutation DeleteRetentionPolicy($id: uuid!) {
  delete_retention_policies_by_pk(id: $id) { id }
}`,
    variables: (input) => ({ id: (input as z.infer<typeof deletePolicyInput>).policyId }),
    mapResult: (data) => rootOf(data, 'delete_retention_policies_by_pk') ?? null,
  },
  sqlRefusals(DELETE_POLICY_REFUSALS),
);

/** Deletes a policy (its runs keep their rows, without the link); refused while a processing activity names it. */
export const deleteRetentionPolicy = defineMutation('itap:delete-retention-policy', {
  binding: deletePolicyOperation.binding,
  input: schema(deletePolicyInput),
  output: schema(z.object({ id: z.string() }).nullable()),
  effects: [{ resource: RETENTION_POLICY_RESOURCE }],
});
