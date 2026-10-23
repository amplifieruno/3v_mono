import { type DataProvider, type MutationContext, createMutationDescriptor, createQueryDescriptor } from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ItapAuthProvider } from '../../src/auth';
import { createItapHasuraProvider } from '../../src/data/provider';
import { ACCESS_BINDING } from '../../src/modules/access/policy-ops';
import { simulateAccessPolicyOperation, simulation } from '../../src/modules/access/simulation-query';
import {
  ADMIN_EMAIL,
  DEV_GRAPHQL,
  DEV_STACK_ENABLED,
  NOVA_ADMIN_EMAIL,
  NOVA_NAME,
  devAdminSecret,
  signInDev,
} from '../support/dev-stack';

/**
 * Access policies against the dev stack (Nova, two `org_admin` members), on a policy the test
 * creates: a draft names a person and a door; the simulation shows the seeded decision it would
 * deny and writes nothing (Review Focus 2: decisions, audit rows, epochs and the version stay as
 * they were); submitted, the version is frozen; its submitter's approval is refused with
 * `four_eyes_required` and the second admin's goes through (Review Focus 1); rolling back copies a
 * superseded version (subjects and targets included) into a draft that is submitted and rejected
 * with a reason; archiving takes the policy out of force. Before it is submitted the version is
 * made valid from 2099 only, so it never decides a real door. Cleanup: the policy is deleted with
 * the admin secret (its versions cascade); approvals leave audit rows and terminal syncs (logs).
 */

const SESSION = { providerId: 'hasura', sessionKey: 'access-policies-dev-test', scopeKey: null, bindingRevision: '1' } as const;

type Row = Record<string, unknown>;

interface VersionRow {
  readonly id: string;
  readonly version: number;
  readonly status: string;
}

function context(): MutationContext {
  return {
    signal: new AbortController().signal,
    requestContext: {},
    session: { sessionKey: SESSION.sessionKey, scopeKey: null, generation: 1 },
    providerServiceKey: 'hasura',
    idempotencyKey: crypto.randomUUID(),
  };
}

describe.skipIf(!DEV_STACK_ENABLED)('access policies against the dev stack', () => {
  let first: ItapAuthProvider;
  let second: ItapAuthProvider;
  let policyId = '';

  const providerOf = (auth: ItapAuthProvider): DataProvider => createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);

  const custom = (auth: ItapAuthProvider, kind: 'mutation' | 'query', operation: string, input: Row) => {
    const descriptor = { ...SESSION, kind: 'custom', ref: { namespace: 'default', id: operation }, resource: ACCESS_BINDING, operation, input };
    const provider = providerOf(auth);
    return kind === 'mutation'
      ? provider.mutations?.custom?.(createMutationDescriptor(descriptor as never) as never, context())
      : provider.queries?.custom?.(createQueryDescriptor(descriptor as never) as never, context());
  };
  const mutate = async (auth: ItapAuthProvider, operation: string, input: Row) => (await custom(auth, 'mutation', operation, input)) as VersionRow;

  const send = async (auth: ItapAuthProvider | null, query: string, variables: Row = {}) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth === null) headers['x-hasura-admin-secret'] = devAdminSecret();
    else headers.Authorization = `Bearer ${await auth.getToken()}`;
    const response = await fetch(DEV_GRAPHQL, { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
    return (await response.json()) as { data?: Row; errors?: { message: string }[] };
  };
  const graphql = async (query: string, variables: Row = {}, auth: ItapAuthProvider | null = first): Promise<Row> => {
    const body = await send(auth, query, variables);
    expect(body.errors, JSON.stringify(body.errors)).toBeUndefined();
    return body.data ?? {};
  };

  const versionById = async (id: string): Promise<Row> =>
    (
      await graphql(
        `query ($id: uuid!) { access_policy_versions_by_pk(id: $id) {
          id version status updated_at submitted_by approved_by rejection_reason
          access_policy_version_subjects { profile_id } access_policy_version_targets { access_point_id }
        } }`,
        { id },
      )
    ).access_policy_versions_by_pk as Row;

  /** What a simulation must leave as it was. */
  const snapshot = async (versionId: string) => {
    const data = await graphql(
      `query ($v: uuid!) {
        access_decisions_aggregate { aggregate { count } }
        audit_log_aggregate(where: { entity: { _like: "access_%" } }) { aggregate { count } }
        organization_settings { policy_epoch policy_urgent_epoch }
        access_policy_versions_by_pk(id: $v) { status updated_at }
      }`,
      { v: versionId },
    );
    return JSON.stringify(data);
  };

  beforeAll(async () => {
    first = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    second = await signInDev(NOVA_ADMIN_EMAIL, NOVA_NAME);
    const data = await graphql('mutation ($name: String!) { insert_access_policies_one(object: { name: $name }) { id } }', {
      name: `Dev test policy ${crypto.randomUUID()}`,
    });
    policyId = String((data.insert_access_policies_one as Row).id);
  }, 60_000);

  afterAll(async () => {
    if (policyId === '') return;
    // org_admin may delete it only while nothing is in force; the versions' history needs the admin secret.
    await graphql('mutation ($id: uuid!) { delete_access_policies_by_pk(id: $id) { id } }', { id: policyId }, null);
  }, 60_000);

  it('should draft, simulate without writing, submit, enforce four-eyes, roll back, reject and archive', async () => {
    // A seeded decision that granted a known person at a door: the draft denies exactly them there.
    const decided = (
      (await graphql(
        `{ access_decisions(where: { result: { _eq: granted }, profile_id: { _is_null: false }, access_point_id: { _is_null: false } },
             order_by: { decided_at: desc }, limit: 1) { id profile_id access_point_id decided_at } }`,
      )).access_decisions as Row[]
    )[0];
    expect(decided, 'the seed has granted decisions').toBeDefined();
    const at = Date.parse(String(decided?.decided_at));

    // "Draft a change" on a new policy: an empty draft, version 1; asked again, the same one.
    const draft = await mutate(first, 'createAccessPolicyDraft', { policyId, fromVersionId: null });
    expect(draft).toMatchObject({ version: 1, status: 'draft' });
    expect((await mutate(first, 'createAccessPolicyDraft', { policyId, fromVersionId: null })).id).toBe(draft.id);
    await graphql(
      'mutation ($id: uuid!) { update_access_policy_versions_by_pk(pk_columns: { id: $id }, _set: { effect: deny, priority: 1000 }) { id } }',
      { id: draft.id },
    );
    await graphql(
      `mutation ($v: uuid!, $p: uuid!, $d: uuid!) {
        insert_access_policy_version_subjects_one(object: { version_id: $v, profile_id: $p }) { id }
        insert_access_policy_version_targets_one(object: { version_id: $v, access_point_id: $d }) { id }
      }`,
      { v: draft.id, p: decided?.profile_id, d: decided?.access_point_id },
    );

    // Simulate (Review Focus 2): the same function and answer shape the console reads, around the decision.
    const before = await snapshot(draft.id);
    const around = simulation.parse(
      (
        (await graphql(simulateAccessPolicyOperation.document.document, {
          version: draft.id,
          from: new Date(at - 3_600_000).toISOString(),
          to: new Date(at + 3_600_000).toISOString(),
          limit: 100,
        })).simulate_access_policy as Row[]
      )[0],
    );
    expect(around.granted_to_denied).toBeGreaterThanOrEqual(1);
    expect(around.samples.find((s) => s.decision_id === decided?.id)).toMatchObject({ old_result: 'granted', new_result: 'denied', new_reason: 'policy_deny' });
    // The console's own call (last 30 days) answers too.
    const console30 = simulation.nullable().parse(await custom(first, 'query', 'simulateAccessPolicy', { versionId: draft.id, period: '30d', limit: 20 }));
    expect(console30?.version_id).toBe(draft.id);
    expect(await snapshot(draft.id)).toBe(before);

    // Never deciding a real door: valid from 2099 only. Then submit: frozen.
    await graphql(
      'mutation ($id: uuid!) { update_access_policy_versions_by_pk(pk_columns: { id: $id }, _set: { valid_from: "2099-01-01T00:00:00Z" }) { id } }',
      { id: draft.id },
    );
    expect(await mutate(first, 'submitAccessPolicyVersion', { versionId: draft.id })).toMatchObject({ status: 'pending_approval' });
    const frozen = await send(first, 'mutation ($id: uuid!) { update_access_policy_versions_by_pk(pk_columns: { id: $id }, _set: { priority: 5 }) { id } }', {
      id: draft.id,
    });
    expect(frozen.errors?.[0]?.message).toContain('access_policy_version_pending');
    const frozenChild = await send(first, 'mutation ($v: uuid!) { insert_access_policy_version_subjects_one(object: { version_id: $v, profile_type: visitor }) { id } }', {
      v: draft.id,
    });
    expect(frozenChild.errors?.[0]?.message).toContain('access_policy_version_pending');

    // Four-eyes (Review Focus 1): the submitter's approval is refused, the second admin's goes through.
    await expect(mutate(first, 'approveAccessPolicyVersion', { versionId: draft.id })).rejects.toMatchObject({
      kind: 'validation',
      code: 'four_eyes_required',
    });
    expect((await versionById(draft.id)).status).toBe('pending_approval');
    expect(await mutate(second, 'approveAccessPolicyVersion', { versionId: draft.id })).toMatchObject({ status: 'published' });
    const policy = (await graphql('query ($id: uuid!) { access_policies_by_pk(id: $id) { current_version_id } }', { id: policyId }))
      .access_policies_by_pk as Row;
    expect(policy.current_version_id).toBe(draft.id);

    // A second version, approved, supersedes the first.
    const next = await mutate(first, 'createAccessPolicyDraft', { policyId, fromVersionId: null });
    expect(next).toMatchObject({ version: 2, status: 'draft' });
    await mutate(first, 'submitAccessPolicyVersion', { versionId: next.id });
    await mutate(second, 'approveAccessPolicyVersion', { versionId: next.id });
    expect((await versionById(draft.id)).status).toBe('superseded');

    // Roll back to version 1: a new draft copied from it, subjects and targets included.
    const rollback = await mutate(first, 'createAccessPolicyDraft', { policyId, fromVersionId: draft.id });
    expect(rollback).toMatchObject({ version: 3, status: 'draft' });
    expect(await versionById(rollback.id)).toMatchObject({
      access_policy_version_subjects: [{ profile_id: decided?.profile_id }],
      access_policy_version_targets: [{ access_point_id: decided?.access_point_id }],
      approved_by: null,
    });
    // A second rollback while it is open is refused clearly.
    await expect(mutate(first, 'createAccessPolicyDraft', { policyId, fromVersionId: draft.id })).rejects.toMatchObject({
      kind: 'validation',
      code: 'version_open_exists',
    });

    // Submitted and rejected with a reason: back to draft, the reason kept.
    await mutate(first, 'submitAccessPolicyVersion', { versionId: rollback.id });
    await expect(mutate(second, 'rejectAccessPolicyVersion', { versionId: rollback.id, reason: '  ' })).rejects.toMatchObject({
      code: 'rejection_reason_required',
    });
    expect(await mutate(second, 'rejectAccessPolicyVersion', { versionId: rollback.id, reason: 'Not yet' })).toMatchObject({ status: 'draft' });
    expect(await versionById(rollback.id)).toMatchObject({ status: 'draft', rejection_reason: 'Not yet', submitted_by: null });

    // Archive: out of force for good, the open draft stays a draft; no new draft afterwards.
    const archived = await custom(first, 'mutation', 'archiveAccessPolicy', { policyId });
    expect(archived).toMatchObject({ id: policyId, is_archived: true });
    const after = (await graphql('query ($id: uuid!) { access_policies_by_pk(id: $id) { current_version_id is_archived } }', { id: policyId }))
      .access_policies_by_pk as Row;
    expect(after).toEqual({ current_version_id: null, is_archived: true });
    expect((await versionById(next.id)).status).toBe('superseded');
    await expect(mutate(first, 'createAccessPolicyDraft', { policyId, fromVersionId: null })).rejects.toMatchObject({
      code: 'access_policy_archived',
    });
  }, 180_000);
});
