import { type FlowConfig, type FlowUnknownCheck, cond, ref } from '@burojs/core';
import { NAV_ICONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { RETENTION_POLICY_RESOURCE } from '../../data/resource-names';
import { fieldApplied } from '../../data/status-applied';
import { deleteRetentionPolicy, setRetentionPolicyActive } from './retention-policy-ops';

const active = ref('record', 'is_active');
// From the "More" menu, where a confirm-only flow keeps its toast (G72).
const surfaces = { default: 'menu', show: 'menu' } as const;

/*
 * Activation is a flow over `update_retention_policies_by_pk` with the policy refusals mapped
 * (`RETENTION_POLICY_REFUSALS`): a second active policy for the same class and facility is
 * refused by the unique index, and the record form could only show the generic alert (G14).
 */

/** "Deactivate" on an active policy: the class (in its scope) is no longer purged by it. */
export const deactivatePolicyFlow = {
  texts: {
    label: 'Deactivate',
    confirm:
      'Deactivate this policy? From the next nightly run its rows are no longer purged by it: a facility-specific policy hands its facility back to the organization-wide one, an organization-wide one leaves the class kept forever (no policy = keep).',
    notify: 'The policy is inactive.',
    doc: {
      summary:
        'Stops the policy from purging: with no other active policy for its scope, its rows are kept. The policy stays, with its runs, and can be activated again.',
    },
  },
  icon: NAV_ICONS.deactivatePolicy,
  surfaces,
  when: cond.equals(active, true),
  confirm: true,
  submit: {
    mutation: setRetentionPolicyActive,
    retry: 'after-auth-refresh',
    input: { policyId: ref('record', 'id'), active: false },
    onUnknown: { check: fieldApplied(RETENTION_POLICY_RESOURCE, 'is_active', false) },
  },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;

/** "Activate" on an inactive policy: refused while another active policy covers the same scope. */
export const activatePolicyFlow = {
  texts: {
    label: 'Activate',
    confirm:
      'Activate this policy? From the next nightly run, rows of its class (in its facility, or the whole organization) older than its retention are purged, except what a legal hold covers. Use the retention plan to see how many rows that is.',
    notify: 'The policy is active.',
    doc: {
      summary:
        'Makes the policy purge again. Only one active policy per class and facility: deactivate the other one first, or the activation is refused.',
    },
  },
  icon: NAV_ICONS.activatePolicy,
  surfaces,
  when: cond.equals(active, false),
  confirm: true,
  submit: {
    mutation: setRetentionPolicyActive,
    retry: 'after-auth-refresh',
    input: { policyId: ref('record', 'id'), active: true },
    onUnknown: { check: fieldApplied(RETENTION_POLICY_RESOURCE, 'is_active', true) },
  },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;

/** Check again for Delete: the policy is gone. */
export const policyDeleted: FlowUnknownCheck = async ({ record, data }) => {
  const id = record?.id;
  if (typeof id !== 'string' || id === '') return 'unknown';
  try {
    const { data: rows } = await data.many(resourceByName(RETENTION_POLICY_RESOURCE) as never, { ids: [id] } as never);
    return (rows as readonly unknown[]).length === 0 ? 'applied' : 'not-applied';
  } catch {
    return 'unknown';
  }
};

/** Replaces the built-in Delete (G54): a policy named by a processing activity is refused with the reason. */
export const deletePolicyFlow = {
  texts: {
    label: 'Delete',
    confirm:
      'Delete this policy? Its class (in its scope) is no longer purged by it; the runs keep what they did, without the link. To pause it, deactivate it instead.',
    notify: 'Retention policy deleted.',
    doc: {
      summary:
        'Deletes the policy; the runs keep their rows. Refused while a record of processing names it as its retention: deactivate it instead.',
    },
  },
  icon: 'Trash2',
  variant: 'destructive',
  order: 1000,
  surfaces: { default: 'menu' },
  confirm: true,
  submit: {
    mutation: deleteRetentionPolicy,
    retry: 'never',
    input: { policyId: ref('record', 'id') },
    onUnknown: { check: policyDeleted },
  },
  then: { notify: true, redirect: { resource: RETENTION_POLICY_RESOURCE, action: 'list' } },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;
