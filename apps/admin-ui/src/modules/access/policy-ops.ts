import { defineMutation } from '@burojs/core';
import { z } from 'zod';
import { type HasuraOperationEntry, hasuraOperation, rootOf } from '../../data/operations';
import {
  ACCESS_POLICY_RESOURCE,
  ACCESS_POLICY_SUBJECT_RESOURCE,
  ACCESS_POLICY_TARGET_RESOURCE,
  ACCESS_POLICY_VERSION_RESOURCE,
} from '../../data/resource-names';
import { schema } from '../../data/schema';
import { type SqlRefusalText, sqlRefusals } from '../../data/sql-refusals';

/** The registry key the access operations are bound under. */
export const ACCESS_BINDING = 'access';

const NOTHING = ' Nothing was changed.';

/** Raised by every lifecycle function (`itap.require_active_member`). */
const MEMBER: Readonly<Record<string, SqlRefusalText>> = {
  member_required: 'Only an active member of the organization can change access policies (your membership is suspended or expired).' + NOTHING,
};
const VERSION_GONE: Readonly<Record<string, SqlRefusalText>> = {
  access_policy_version_not_found: 'The version no longer exists (a discarded draft?): reload the policy.' + NOTHING,
  access_policy_archived: 'The policy was archived meanwhile: its versions can no longer change.' + NOTHING,
};

/** What `create_access_policy_draft` raises (`itap.create_draft_version` / `create_draft_version_from`). */
export const DRAFT_REFUSALS = {
  ...MEMBER,
  access_policy_not_found: 'The policy no longer exists.' + NOTHING,
  version_parent_not_found: 'The policy no longer exists.' + NOTHING,
  access_policy_archived: 'The policy is archived: no new version can be drafted.' + NOTHING,
  version_not_found: 'That version is not one of this policy’s versions: reload the policy.' + NOTHING,
  version_open_exists:
    'The policy already has an open version (a draft, or one pending approval): approve, reject or discard it first, then roll back.' +
    NOTHING,
};

/** What `submit_access_policy_version` raises. */
export const SUBMIT_REFUSALS = {
  ...MEMBER,
  ...VERSION_GONE,
  access_policy_version_not_draft: 'Only a draft can be submitted: this version was submitted or approved meanwhile. Reload it.' + NOTHING,
  access_policy_version_incomplete: 'Name at least one subject (who) and one target (where) before submitting.' + NOTHING,
};

/** What `approve_access_policy_version` raises (four-eyes included; `itap.publish_version` behind it). */
export const APPROVE_REFUSALS = {
  ...MEMBER,
  ...VERSION_GONE,
  access_policy_version_not_pending:
    'The version is no longer waiting for approval: someone approved or rejected it meanwhile. Reload it.' + NOTHING,
  four_eyes_required: 'You submitted this version, so another member must approve it (four-eyes rule).' + NOTHING,
  access_policy_versions_four_eyes: 'You submitted this version, so another member must approve it (four-eyes rule).' + NOTHING,
  version_already_published: 'This version is already in force.' + NOTHING,
};

/** What `reject_access_policy_version` raises. */
export const REJECT_REFUSALS = {
  ...MEMBER,
  ...VERSION_GONE,
  access_policy_version_not_pending:
    'The version is no longer waiting for approval: someone approved or rejected it meanwhile. Reload it.' + NOTHING,
  rejection_reason_required: 'Say why the version is rejected.' + NOTHING,
};

/** What `archive_access_policy` raises. */
export const ARCHIVE_REFUSALS = {
  ...MEMBER,
  access_policy_not_found: 'The policy no longer exists.' + NOTHING,
  access_policy_archived: 'The policy is already archived.' + NOTHING,
};

export const draftInput = z.object({ policyId: z.string().uuid(), fromVersionId: z.string().uuid().nullable() });
export const versionInput = z.object({ versionId: z.string().uuid() });
export const rejectInput = z.object({ versionId: z.string().uuid(), reason: z.string() });
export const policyInput = z.object({ policyId: z.string().uuid() });

/** A version as the lifecycle functions return it. */
export const changedVersion = z.object({ id: z.string(), policy_id: z.string(), version: z.number(), status: z.string() });
/** A policy as `archive_access_policy` returns it. */
export const changedPolicy = z.object({ id: z.string(), code: z.string(), is_archived: z.boolean() });

const VERSION_SELECTION = '{ id policy_id version status }';

function firstRowOperation(
  operation: string,
  field: string,
  document: string,
  variables: (input: unknown) => Readonly<Record<string, unknown>>,
  refusals: Readonly<Record<string, SqlRefusalText>>,
): HasuraOperationEntry {
  return hasuraOperation(
    ACCESS_BINDING,
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
    sqlRefusals(refusals),
  );
}

const byVersion = (input: unknown) => ({ version: (input as z.infer<typeof versionInput>).versionId });

export const createAccessPolicyDraftOperation = firstRowOperation(
  'createAccessPolicyDraft',
  'create_access_policy_draft',
  `mutation CreateAccessPolicyDraft($policy: uuid!, $from: uuid) {
  create_access_policy_draft(args: { p_policy: $policy, p_from_version: $from }) ${VERSION_SELECTION}
}`,
  (input) => {
    const { policyId, fromVersionId } = input as z.infer<typeof draftInput>;
    return { policy: policyId, from: fromVersionId };
  },
  DRAFT_REFUSALS,
);

export const submitAccessPolicyVersionOperation = firstRowOperation(
  'submitAccessPolicyVersion',
  'submit_access_policy_version',
  `mutation SubmitAccessPolicyVersion($version: uuid!) {
  submit_access_policy_version(args: { p_version: $version }) ${VERSION_SELECTION}
}`,
  byVersion,
  SUBMIT_REFUSALS,
);

export const approveAccessPolicyVersionOperation = firstRowOperation(
  'approveAccessPolicyVersion',
  'approve_access_policy_version',
  `mutation ApproveAccessPolicyVersion($version: uuid!) {
  approve_access_policy_version(args: { p_version: $version }) ${VERSION_SELECTION}
}`,
  byVersion,
  APPROVE_REFUSALS,
);

export const rejectAccessPolicyVersionOperation = firstRowOperation(
  'rejectAccessPolicyVersion',
  'reject_access_policy_version',
  `mutation RejectAccessPolicyVersion($version: uuid!, $reason: String!) {
  reject_access_policy_version(args: { p_version: $version, p_reason: $reason }) ${VERSION_SELECTION}
}`,
  (input) => {
    const { versionId, reason } = input as z.infer<typeof rejectInput>;
    return { version: versionId, reason };
  },
  REJECT_REFUSALS,
);

export const archiveAccessPolicyOperation = firstRowOperation(
  'archiveAccessPolicy',
  'archive_access_policy',
  `mutation ArchiveAccessPolicy($policy: uuid!) {
  archive_access_policy(args: { p_policy: $policy }) { id code is_archived }
}`,
  (input) => ({ policy: (input as z.infer<typeof policyInput>).policyId }),
  ARCHIVE_REFUSALS,
);

const effects = [
  { resource: ACCESS_POLICY_RESOURCE },
  { resource: ACCESS_POLICY_VERSION_RESOURCE },
  { resource: ACCESS_POLICY_SUBJECT_RESOURCE },
  { resource: ACCESS_POLICY_TARGET_RESOURCE },
];

/** The policy's open version: the existing draft or pending one, else a new draft copied from the version in force (or `fromVersionId`). */
export const createAccessPolicyDraft = defineMutation('itap:create-access-policy-draft', {
  binding: createAccessPolicyDraftOperation.binding,
  input: schema(draftInput),
  output: schema(changedVersion.nullable()),
  effects,
});

/** Draft → pending approval (frozen). */
export const submitAccessPolicyVersion = defineMutation('itap:submit-access-policy-version', {
  binding: submitAccessPolicyVersionOperation.binding,
  input: schema(versionInput),
  output: schema(changedVersion.nullable()),
  effects,
});

/** Pending → published by a member other than the submitter; the previous version is superseded. */
export const approveAccessPolicyVersion = defineMutation('itap:approve-access-policy-version', {
  binding: approveAccessPolicyVersionOperation.binding,
  input: schema(versionInput),
  output: schema(changedVersion.nullable()),
  effects,
});

/** Pending → draft with the reason. */
export const rejectAccessPolicyVersion = defineMutation('itap:reject-access-policy-version', {
  binding: rejectAccessPolicyVersionOperation.binding,
  input: schema(rejectInput),
  output: schema(changedVersion.nullable()),
  effects,
});

/** Archives the policy: the version in force is superseded, a pending one goes back to draft. */
export const archiveAccessPolicy = defineMutation('itap:archive-access-policy', {
  binding: archiveAccessPolicyOperation.binding,
  input: schema(policyInput),
  output: schema(changedPolicy.nullable()),
  effects,
});

/** The lifecycle operations, for the module's registry. */
export const POLICY_OPERATIONS = [
  createAccessPolicyDraftOperation,
  submitAccessPolicyVersionOperation,
  approveAccessPolicyVersionOperation,
  rejectAccessPolicyVersionOperation,
  archiveAccessPolicyOperation,
];

/** The lifecycle mutations, for the module's `uses`. */
export const POLICY_MUTATIONS = [
  createAccessPolicyDraft,
  submitAccessPolicyVersion,
  approveAccessPolicyVersion,
  rejectAccessPolicyVersion,
  archiveAccessPolicy,
];
