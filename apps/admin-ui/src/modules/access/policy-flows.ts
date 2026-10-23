import { type FlowConfig, cond, ref } from '@burojs/core';
import { NAV_ICONS } from '../../app/nav';
import { ACCESS_POLICY_RESOURCE, ACCESS_POLICY_VERSION_RESOURCE } from '../../data/resource-names';
import { fieldApplied } from '../../data/status-applied';
import { archiveAccessPolicy, createAccessPolicyDraft } from './policy-ops';
import { openVersionExists } from './version-flows';

const NOT_ARCHIVED = cond.not(cond.equals(ref('record', 'is_archived'), true));

/**
 * "Draft a change" on a policy: `create_access_policy_draft` answers the policy's open version
 * (a draft, or one pending approval), else a new draft copied from the version in force with its
 * subjects and targets (an empty one for a new policy); the version opens. Changing a policy is
 * always changing a draft: the version in force never changes in place.
 */
export const draftChangeFlow = {
  texts: {
    label: 'Draft a change',
    notify: 'Version {{version}} is the policy’s open version.',
    doc: {
      summary:
        'Opens the policy’s open version: the draft (or the version waiting for approval), else a new draft copied from the version in force. The version in force keeps applying until the draft is approved.',
    },
  },
  icon: NAV_ICONS.draftChange,
  surfaces: { default: 'menu', show: 'auto' },
  when: NOT_ARCHIVED,
  submit: {
    mutation: createAccessPolicyDraft,
    // Idempotent: a second call answers the same open version.
    retry: 'after-auth-refresh',
    input: { policyId: ref('record', 'id'), fromVersionId: null },
    onUnknown: { check: openVersionExists('id') },
  },
  then: {
    notify: { params: { version: ref('result', 'version') } },
    open: { resource: ACCESS_POLICY_VERSION_RESOURCE, id: ref('result', 'id'), mode: 'show' },
  },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;

/**
 * "Archive" on a policy: `archive_access_policy` takes it out of force for good. The version in
 * force is superseded, a version waiting for approval goes back to draft (reason
 * `policy_archived`) and no version can be drafted afterwards; its versions and the decisions they
 * made stay as history.
 */
export const archiveFlow = {
  texts: {
    label: 'Archive',
    confirm:
      'Archive this policy? It stops applying at once at every door (terminals are updated urgently), a version waiting for approval goes back to draft, and it cannot be brought back: draft a new policy instead.',
    notify: '{{code}} is archived.',
    doc: {
      summary:
        'Retires the policy for good: no version is in force any more, a pending version is sent back to draft and no new version can be drafted. Its history stays.',
    },
  },
  icon: NAV_ICONS.archivePolicy,
  variant: 'destructive',
  surfaces: { default: 'menu', show: 'menu' },
  when: NOT_ARCHIVED,
  confirm: true,
  submit: {
    mutation: archiveAccessPolicy,
    retry: 'never',
    input: { policyId: ref('record', 'id') },
    onUnknown: { check: fieldApplied(ACCESS_POLICY_RESOURCE, 'is_archived', true) },
  },
  then: { notify: { params: { code: ref('result', 'code') } } },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;
