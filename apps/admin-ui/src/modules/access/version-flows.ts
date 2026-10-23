import { type FlowConfig, type FlowUnknownCheck, type Layout, type ScreenRef, cond, ref } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { ACCESS_POLICY_VERSION_RESOURCE } from '../../data/resource-names';
import { fieldApplied } from '../../data/status-applied';
import { carriedId } from '../../fields/carried-id';
import { checkNotBlank } from '../../fields/not-blank';
import {
  approveAccessPolicyVersion,
  createAccessPolicyDraft,
  rejectAccessPolicyVersion,
  submitAccessPolicyVersion,
} from './policy-ops';
import { versionReviewBlock } from './version-review-block';

const status = ref('record', 'status');
export const IS_DRAFT = cond.equals(status, 'draft');
export const IS_PENDING = cond.equals(status, 'pending_approval');
export const IS_SUPERSEDED = cond.equals(status, 'superseded');

const versionInput = { versionId: ref('record', 'id') };
const statusIs = (value: string) => fieldApplied(ACCESS_POLICY_VERSION_RESOURCE, 'status', value);

/** Check again after a lost "Draft a change" or roll back: the policy has an open version now. */
export function openVersionExists(policyField: 'id' | 'policy_id'): FlowUnknownCheck {
  return async ({ record, data }) => {
    const policyId = record?.[policyField];
    if (typeof policyId !== 'string' || policyId === '') return 'unknown';
    try {
      const { data: rows } = await data.list(resourceByName(ACCESS_POLICY_VERSION_RESOURCE) as never, {
        filter: {
          and: [
            { field: 'policy_id', op: 'eq', value: policyId },
            { field: 'status', op: 'in', value: ['draft', 'pending_approval'] },
          ],
        },
        pagination: { kind: 'offset', page: 1, pageSize: 1 },
      } as never);
      return (rows as readonly unknown[]).length > 0 ? 'applied' : 'not-applied';
    } catch {
      return 'unknown';
    }
  };
}

/** The flow's record id for a placement: a flow form's layout is typed without a record (G20). */
const recordId = ref('record', 'id') as unknown as ScreenRef<'record'>;

/** A form with no input: the version id only, carried (G35), so the dialog can show the version. */
const reviewFields = { version_id: carriedId('Version') };

/**
 * The dialog of submit and approve: what goes in force (or is frozen), read fresh. A form body,
 * not a review step: a review cannot read the flow's record (G35), and a form hosts the dialog,
 * so the flow's toast is shown (a confirm-only flow loses it, G72).
 */
const reviewForm = (step: 'submit' | 'approve') => ({
  fields: reviewFields,
  initial: { version_id: ref('record', 'id') },
  body: (l: Layout<typeof reviewFields>) => [
    l.place(versionReviewBlock, { key: `${step}-review`, props: { versionId: recordId, step } }),
  ],
});

/**
 * "Submit for approval" on a draft: `submit_access_policy_version` freezes it until another
 * member approves or rejects it. The review lists what is submitted; a draft without a subject or
 * a target is refused with the reason (`access_policy_version_incomplete`).
 */
export const submitFlow = {
  texts: {
    label: 'Submit for approval',
    notify: 'Version {{version}} is waiting for approval by another member.',
    doc: {
      summary:
        'Freezes the draft and asks for approval: another member must approve it before it goes in force (four-eyes rule). It needs at least one subject and one target.',
    },
  },
  icon: NAV_ICONS.submitForApproval,
  surfaces: { default: 'menu', show: 'auto' },
  when: IS_DRAFT,
  form: reviewForm('submit'),
  submit: { mutation: submitAccessPolicyVersion, retry: 'never', input: versionInput, onUnknown: { check: statusIs('pending_approval') } },
  then: { notify: { params: { version: ref('result', 'version') } } },
} satisfies FlowConfig<unknown, Record<never, never>, typeof reviewFields>;

/**
 * "Approve" on a pending version: `approve_access_policy_version` puts it in force; the version
 * in force so far is superseded. Not offered to the member who submitted it (a rule with the
 * reason); a forced call is still refused by the database (`four_eyes_required`).
 */
export const approveFlow = {
  texts: {
    label: 'Approve',
    notify: 'Version {{version}} is approved and in force.',
    doc: {
      summary:
        'Puts the submitted version in force at once, as the second member (four-eyes rule): the doors decide by it from now on and the previous version is superseded.',
    },
  },
  icon: NAV_ICONS.approve,
  surfaces: { default: 'menu', show: 'auto' },
  when: IS_PENDING,
  form: reviewForm('approve'),
  submit: { mutation: approveAccessPolicyVersion, retry: 'never', input: versionInput, onUnknown: { check: statusIs('published') } },
  then: { notify: { params: { version: ref('result', 'version') } } },
} satisfies FlowConfig<unknown, Record<never, never>, typeof reviewFields>;

const rejectFields = {
  reason: f.text({
    required: true,
    validate: checkNotBlank(),
    texts: {
      label: 'Reason',
      doc: { summary: 'Why the version is sent back: kept on the version, shown to whoever edits the draft next, and recorded in the audit log.' },
    },
  }),
};

/**
 * "Reject" on a pending version: back to draft with the reason (`reject_access_policy_version`).
 * Any member may reject, the submitter included (to take it back for changes).
 */
export const rejectFlow = {
  texts: {
    label: 'Reject',
    notify: 'Version {{version}} is back to draft.',
    doc: {
      summary:
        'Sends the submitted version back to draft with a reason; it can be edited and submitted again. The submitter can reject their own version to take it back.',
    },
  },
  icon: NAV_ICONS.reject,
  variant: 'destructive',
  surfaces: { default: 'menu', show: 'auto' },
  when: IS_PENDING,
  form: { fields: rejectFields },
  submit: {
    mutation: rejectAccessPolicyVersion,
    retry: 'never',
    input: { versionId: ref('record', 'id'), reason: ref('values', 'reason') },
    onUnknown: { check: statusIs('draft') },
  },
  then: { notify: { params: { version: ref('result', 'version') } } },
} satisfies FlowConfig<unknown, Record<never, never>, typeof rejectFields>;

/**
 * "Roll back to this version" on a superseded version: a new draft copied from it, subjects and
 * targets included (`create_access_policy_draft` with the version), which opens; it goes in force
 * only after it is submitted and approved like any change. Refused while the policy has an open
 * version (`version_open_exists`).
 */
export const rollbackFlow = {
  texts: {
    label: 'Roll back to this version',
    confirm:
      'Start a new draft copied from this version? It goes in force only once submitted and approved by another member; the version in force stays until then.',
    notify: 'Draft version {{version}} is a copy of the earlier version.',
    doc: {
      summary:
        'Starts a new draft as a copy of an earlier version, with its subjects and targets. There is no direct republish: the copy is submitted and approved like any change.',
    },
  },
  icon: NAV_ICONS.rollback,
  surfaces: { default: 'menu', show: 'menu' },
  when: IS_SUPERSEDED,
  confirm: true,
  submit: {
    mutation: createAccessPolicyDraft,
    retry: 'never',
    input: { policyId: ref('record', 'policy_id'), fromVersionId: ref('record', 'id') },
    onUnknown: { check: openVersionExists('policy_id') },
  },
  then: {
    notify: { params: { version: ref('result', 'version') } },
    open: { resource: ACCESS_POLICY_VERSION_RESOURCE, id: ref('result', 'id'), mode: 'show' },
  },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;
