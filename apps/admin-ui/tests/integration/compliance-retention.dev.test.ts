import {
  type DataProvider,
  type MutationContext,
  type QueryContext,
  createMutationDescriptor,
  createQueryDescriptor,
} from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createItapHasuraProvider } from '../../src/data/provider';
import { sqlRefusals } from '../../src/data/sql-refusals';
import { LEGAL_HOLD_PROFILE_TARGET_RESOURCE, LEGAL_HOLD_RESOURCE, RETENTION_POLICY_RESOURCE } from '../../src/data/resource-names';
import type { HeldBy } from '../../src/modules/compliance/hold-notice-query';
import { LEGAL_HOLD_REFUSALS } from '../../src/modules/compliance/legal-hold-ops';
import type { RetentionPlan } from '../../src/modules/compliance/retention-plan-query';
import { COMPLIANCE_BINDING, RETENTION_POLICY_REFUSALS } from '../../src/modules/compliance/retention-policy-ops';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, NOVA_NAME, devAdminSecret, signInDev } from '../support/dev-stack';
import { offsetPage } from '../support/pagination';

/**
 * Retention and legal holds of Nova through the console's provider, as `org_admin`:
 * - the retention plan answers counts per policy and writes nothing (runs, run classes, the
 *   retention file queue and retention audit rows counted before and after: Review Focus 2);
 * - a policy below its class floor is refused by the database, and the refusal reads as the floor
 *   sentence; a facility-specific policy is created, edited, a second active one for the same
 *   scope is refused (mapped), deactivated, the other activated, both deleted through the
 *   console's delete;
 * - a legal hold on a seeded profile with a target: the notice's read finds it; its end is set,
 *   shortened, an extension and a move of the start are refused by the database (the console
 *   never offers the start: Review Focus 3); the target cannot be removed while the hold is in
 *   force; "End now" ends it, a second end is refused (mapped); the target then goes.
 * Cleanup with the admin secret (holds have no delete permission, audit rows are append-only).
 */

const IDENTITY = { providerId: 'hasura', sessionKey: 'compliance-retention-dev-test', scopeKey: null, bindingRevision: '1' } as const;
const session = { sessionKey: IDENTITY.sessionKey, scopeKey: null, generation: 1 };
const mutationContext = (): MutationContext => ({
  signal: new AbortController().signal,
  requestContext: {},
  session,
  providerServiceKey: 'hasura',
  idempotencyKey: crypto.randomUUID(),
});
const queryContext = (): QueryContext => ({ signal: new AbortController().signal, requestContext: {}, session, providerServiceKey: 'hasura' }) as QueryContext;

type Row = Record<string, unknown>;
const HOUR = 3_600_000;
const at = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();
const messageOf = (error: unknown): string => (typeof error === 'object' && error !== null ? String((error as { message?: unknown }).message ?? '') : String(error));

describe.skipIf(!DEV_STACK_ENABLED)('retention and legal holds against the dev stack (Nova Tower)', () => {
  let provider: DataProvider;
  let token: () => Promise<string | null>;
  let facility = '';
  let person = '';
  const policies: string[] = [];
  const holds: string[] = [];
  const targets: string[] = [];

  const custom = async (kind: 'mutations' | 'queries', operation: string, input: Row): Promise<unknown> => {
    const descriptor = { ...IDENTITY, kind: 'custom', ref: { namespace: 'default', id: operation }, resource: COMPLIANCE_BINDING, operation, input };
    return kind === 'mutations'
      ? provider.mutations?.custom?.(createMutationDescriptor(descriptor as never) as never, mutationContext())
      : provider.queries?.custom?.(createQueryDescriptor(descriptor as never) as never, queryContext());
  };
  const create = async (resource: string, input: Row): Promise<Row> => {
    const created = (await provider.mutations?.createOne?.(
      createMutationDescriptor({ ...IDENTITY, kind: 'createOne', ref: { namespace: 'default', id: resource }, resource, idField: 'id', input } as never) as never,
      mutationContext(),
    )) as { record: Row };
    return created.record;
  };
  const update = async (resource: string, id: string, input: Row): Promise<Row> => {
    const updated = (await provider.mutations?.updateOne?.(
      createMutationDescriptor({ ...IDENTITY, kind: 'updateOne', ref: { namespace: 'default', id: resource }, resource, idField: 'id', id, input } as never) as never,
      mutationContext(),
    )) as { record: Row };
    return updated.record;
  };
  const remove = async (resource: string, id: string): Promise<unknown> =>
    provider.mutations?.deleteOne?.(
      createMutationDescriptor({ ...IDENTITY, kind: 'deleteOne', ref: { namespace: 'default', id: resource }, resource, idField: 'id', id } as never) as never,
      mutationContext(),
    );
  const one = async (resource: string, id: string): Promise<Row> => {
    const { data } = (await provider.queries?.one?.(
      createQueryDescriptor({ ...IDENTITY, kind: 'one', ref: { namespace: 'default', id: resource }, resource, id } as never) as never,
      queryContext(),
    )) as { data: Row };
    return data;
  };
  const list = async (resource: string, filter: Row): Promise<Row[]> => {
    const { data } = (await provider.queries?.list?.(
      createQueryDescriptor({ ...IDENTITY, kind: 'list', ref: { namespace: 'default', id: resource }, resource, pagination: offsetPage(1, 50), filter } as never) as never,
      queryContext(),
    )) as { data: Row[] };
    return data;
  };
  const sql = async (statement: string): Promise<string[][]> => {
    const response = await fetch(DEV_GRAPHQL.replace('/v1/graphql', '/v2/query'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': devAdminSecret() },
      body: JSON.stringify({ type: 'run_sql', args: { source: 'default', sql: statement } }),
    });
    expect(response.ok, await response.clone().text()).toBe(true);
    return ((await response.json()) as { result?: string[][] }).result ?? [];
  };
  const graphql = async (query: string): Promise<Row> => {
    const response = await fetch(DEV_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ query }),
    });
    const body = (await response.json()) as { data?: Row; errors?: unknown[] };
    expect(body.errors, JSON.stringify(body.errors)).toBeUndefined();
    return body.data ?? {};
  };

  beforeAll(async () => {
    const auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    token = () => auth.getToken();
    provider = createItapHasuraProvider(token, DEV_GRAPHQL);
    const data = await graphql(`{
      facilities(where: { name: { _eq: "Nova Tower" } }) { id }
      profiles(where: { erased_at: { _is_null: true }, processing_restricted: { _eq: false }, _not: { legal_hold_targets: {} } }, order_by: { code: asc }, limit: 1) { id }
    }`);
    facility = String((data.facilities as { id: string }[])[0]?.id ?? '');
    person = String((data.profiles as { id: string }[])[0]?.id ?? '');
    expect(facility).not.toBe('');
    expect(person).not.toBe('');
  }, 60_000);

  afterAll(async () => {
    const quoted = (ids: readonly string[]) => ids.map((id) => `'${id}'`).join(', ');
    const statements = ["select set_config('itap.retention_context', 'on', true)"];
    if (holds.length > 0) {
      // End first (the target guard lets an ended hold's targets go), then delete hold and targets.
      statements.push(`update itap.legal_holds set ends_at = now() where id in (${quoted(holds)}) and (ends_at is null or ends_at > now())`);
      statements.push(`delete from itap.legal_hold_targets where hold_id in (${quoted(holds)})`);
      statements.push(`delete from itap.legal_holds where id in (${quoted(holds)})`);
    }
    if (policies.length > 0) statements.push(`delete from itap.retention_policies where id in (${quoted(policies)})`);
    const audited = [...holds, ...targets, ...policies];
    if (audited.length > 0) {
      statements.push(
        `delete from itap.audit_log where entity in ('legal_holds', 'legal_hold_targets', 'retention_policies') and entity_id in (${quoted(audited)})`,
      );
    }
    await sql(statements.join(';\n'));
  }, 60_000);

  it('should count the plan per policy and write nothing (Review Focus 2)', async () => {
    const snapshot = async () =>
      (
        await sql(`select
          (select count(*) from itap.retention_runs),
          (select count(*) from itap.retention_run_classes),
          (select count(*) from itap.pending_file_deletions where reason like 'retention:%'),
          (select count(*) from itap.audit_log where changes = '{"retention": true}'::jsonb)`)
      )[1];
    const before = await snapshot();
    const now = (await custom('queries', 'retentionPlan', { days: 0 })) as RetentionPlan;
    const ahead = (await custom('queries', 'retentionPlan', { days: 30 })) as RetentionPlan;
    expect(now.rows.length).toBeGreaterThan(20);
    for (const row of now.rows) {
      expect(typeof row.candidates).toBe('number');
      expect(typeof row.held).toBe('number');
    }
    expect(now.rows.some((row) => row.facility_id === facility && row.data_class === 'detections')).toBe(true);
    expect(now.facilities[facility]).toBe('Nova Tower');
    const sum = (plan: RetentionPlan) => plan.rows.reduce((total, row) => total + row.candidates, 0);
    expect(sum(ahead)).toBeGreaterThanOrEqual(sum(now));
    expect(await snapshot()).toEqual(before);
  }, 120_000);

  it('should refuse a policy below its class floor with the floor sentence', async () => {
    const refusal = await create(RETENTION_POLICY_RESOURCE, { data_class: 'audit', retain_days: 30, action: 'delete', is_active: false }).catch((e: unknown) => e);
    const issues = sqlRefusals(RETENTION_POLICY_REFUSALS)({ message: messageOf(refusal), code: 'permission-error' } as never, {});
    expect(issues?.[0]?.code).toBe('retention_policies_retain_days');
    expect(issues?.[0]?.message).toContain('at least 365 days');
    expect(await list(RETENTION_POLICY_RESOURCE, { field: 'data_class', op: 'eq', value: 'audit' })).toHaveLength(1);
  });

  it('should create, edit, deactivate and delete facility policies, one active per scope', async () => {
    const first = await create(RETENTION_POLICY_RESOURCE, {
      data_class: 'locations',
      facility_id: facility,
      retain_days: 36_500,
      action: 'delete',
      is_active: true,
      description: 'Dev test policy',
    });
    policies.push(String(first.id));
    const edited = await update(RETENTION_POLICY_RESOURCE, String(first.id), { retain_days: 3_650, description: 'Dev test policy, edited' });
    expect(edited).toMatchObject({ retain_days: 3_650, is_active: true });
    const second = await create(RETENTION_POLICY_RESOURCE, { data_class: 'locations', facility_id: facility, retain_days: 36_500, action: 'delete', is_active: false });
    policies.push(String(second.id));
    const taken = await custom('mutations', 'setRetentionPolicyActive', { policyId: second.id, active: true }).catch((e: unknown) => e);
    expect(taken).toMatchObject({ kind: 'validation', code: 'retention_policies_active_scope_key' });
    expect(await custom('mutations', 'setRetentionPolicyActive', { policyId: first.id, active: false })).toMatchObject({ is_active: false });
    expect(await custom('mutations', 'setRetentionPolicyActive', { policyId: second.id, active: true })).toMatchObject({ is_active: true });
    expect(await custom('mutations', 'setRetentionPolicyActive', { policyId: second.id, active: false })).toMatchObject({ is_active: false });
    for (const id of [first.id, second.id]) expect(await custom('mutations', 'deleteRetentionPolicy', { policyId: id })).toMatchObject({ id });
    expect(await list(RETENTION_POLICY_RESOURCE, { field: 'id', op: 'in', value: [first.id, second.id] })).toHaveLength(0);
  });

  it('should hold a seeded person, show it to the notice, and move the dates one way only (Review Focus 3)', async () => {
    const hold = await create(LEGAL_HOLD_RESOURCE, { name: 'Dev test hold', reason: 'Dev test claim', starts_at: at(-0.1) });
    holds.push(String(hold.id));
    const target = await create(LEGAL_HOLD_PROFILE_TARGET_RESOURCE, { hold_id: hold.id, profile_id: person });
    targets.push(String(target.id));

    const covering = (await custom('queries', 'legalHoldsCovering', {
      profileIds: [person],
      identityIds: [],
      identityProfileIds: [person],
      incidentIds: [],
      facilityIds: [],
    })) as HeldBy[];
    expect(covering.find((row) => row.id === hold.id)).toMatchObject({ name: 'Dev test hold', via: ['profile'] });

    expect(await update(LEGAL_HOLD_RESOURCE, String(hold.id), { ends_at: at(48) })).toMatchObject({ id: hold.id });
    const shortened = await update(LEGAL_HOLD_RESOURCE, String(hold.id), { ends_at: at(24) });
    expect(Date.parse(String(shortened.ends_at))).toBeLessThan(Date.now() + 25 * HOUR);
    const extended = await update(LEGAL_HOLD_RESOURCE, String(hold.id), { ends_at: at(72) }).catch((e: unknown) => e);
    expect(sqlRefusals(LEGAL_HOLD_REFUSALS)({ message: messageOf(extended) } as never, {})?.[0]?.code).toBe('legal_hold_end_extension');
    const moved = await update(LEGAL_HOLD_RESOURCE, String(hold.id), { starts_at: at(-1) }).catch((e: unknown) => e);
    expect(sqlRefusals(LEGAL_HOLD_REFUSALS)({ message: messageOf(moved) } as never, {})?.[0]?.code).toBe('legal_hold_start_immutable');

    const kept = await remove(LEGAL_HOLD_PROFILE_TARGET_RESOURCE, String(target.id)).catch((e: unknown) => e);
    expect(messageOf(kept)).toContain('legal_hold_active');
    expect(await one(LEGAL_HOLD_PROFILE_TARGET_RESOURCE, String(target.id))).toMatchObject({ hold: { starts_at: expect.any(String) } });

    const ended = (await custom('mutations', 'endLegalHold', { holdId: hold.id })) as Row;
    expect(Date.parse(String(ended.ends_at))).toBeLessThanOrEqual(Date.now() + 5_000);
    const again = await custom('mutations', 'endLegalHold', { holdId: hold.id }).catch((e: unknown) => e);
    expect(again).toMatchObject({ kind: 'validation', code: 'legal_hold_ended' });
    const after = (await custom('queries', 'legalHoldsCovering', {
      profileIds: [person],
      identityIds: [],
      identityProfileIds: [person],
      incidentIds: [],
      facilityIds: [],
    })) as HeldBy[];
    expect(after.find((row) => row.id === hold.id)).toBeUndefined();
    await remove(LEGAL_HOLD_PROFILE_TARGET_RESOURCE, String(target.id));
    expect(await list(LEGAL_HOLD_PROFILE_TARGET_RESOURCE, { field: 'hold_id', op: 'eq', value: hold.id })).toHaveLength(0);
  }, 60_000);
});
