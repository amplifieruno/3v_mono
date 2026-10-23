import {
  type DataProvider,
  type MutationContext,
  type QueryContext,
  createMutationDescriptor,
  createQueryDescriptor,
} from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createItapHasuraProvider } from '../../src/data/provider';
import { ACCESS_DECISION_RESOURCE, ACCESS_GRANT_RESOURCE, ACCESS_POLICY_VERSION_RESOURCE } from '../../src/data/resource-names';
import { traceOf } from '../../src/modules/access/decision-trace-format';
import { ACCESS_BINDING } from '../../src/modules/access/policy-ops';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, NOVA_NAME, devAdminSecret, signInDev } from '../support/dev-stack';
import { offsetPage } from '../support/pagination';

/**
 * Grants and decisions of Nova through the console's provider, as `org_admin`: for a seeded
 * visitor at a seeded door where nothing allows them (`no_rule`), a reusable grant valid for a few
 * minutes lets them through (`check_access` decides by the grant, its trace says so), "Revoke" with
 * a reason ends it and the next test is denied again, and a second revocation is refused; a
 * single-use grant decides once, reads used, and the next test is denied. The decision list reads
 * by keyset; a version reads its policy's `is_archived`. Cleanup with the admin secret, under the
 * retention context (decisions, events and audit rows are append-only): only this test's
 * decisions, their events and what those fanned out, the audit rows of its grants, and the grants.
 */

const IDENTITY = { providerId: 'hasura', sessionKey: 'access-grants-dev-test', scopeKey: null, bindingRevision: '1' } as const;
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
interface Decision {
  readonly id: string;
  readonly result: string;
  readonly reason: string;
}

const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

describe.skipIf(!DEV_STACK_ENABLED)('access grants and decisions against the dev stack (Nova Tower)', () => {
  let provider: DataProvider;
  let token: () => Promise<string | null>;
  let person = '';
  let door = '';
  const grants: string[] = [];
  const decisions: string[] = [];

  const custom = async (kind: 'mutations' | 'queries', operation: string, input: Row): Promise<unknown> => {
    const descriptor = { ...IDENTITY, kind: 'custom', ref: { namespace: 'default', id: operation }, resource: ACCESS_BINDING, operation, input };
    return kind === 'mutations'
      ? provider.mutations?.custom?.(createMutationDescriptor(descriptor as never) as never, mutationContext())
      : provider.queries?.custom?.(createQueryDescriptor(descriptor as never) as never, queryContext());
  };
  const check = async (): Promise<Decision> => {
    const decision = (await custom('mutations', 'checkAccess', { accessPointId: door, profileId: person, identityId: null })) as Decision;
    decisions.push(decision.id);
    return decision;
  };
  const one = async (resource: string, id: string): Promise<Row> => {
    const { data } = (await provider.queries?.one?.(
      createQueryDescriptor({ ...IDENTITY, kind: 'one', ref: { namespace: 'default', id: resource }, resource, id } as never) as never,
      queryContext(),
    )) as { data: Row };
    return data;
  };
  const list = async (resource: string, filter: Row, pagination: Row = offsetPage(1, 50)): Promise<Row[]> => {
    const { data } = (await provider.queries?.list?.(
      createQueryDescriptor({ ...IDENTITY, kind: 'list', ref: { namespace: 'default', id: resource }, resource, pagination, filter } as never) as never,
      queryContext(),
    )) as { data: Row[] };
    return data;
  };
  const grant = async (singleUse: boolean): Promise<string> => {
    const created = (await provider.mutations?.createOne?.(
      createMutationDescriptor({
        ...IDENTITY,
        kind: 'createOne',
        ref: { namespace: 'default', id: ACCESS_GRANT_RESOURCE },
        resource: ACCESS_GRANT_RESOURCE,
        idField: 'id',
        input: {
          profile_id: person,
          access_point_id: door,
          area_id: null,
          valid_from: minutesFromNow(-1),
          valid_until: minutesFromNow(10),
          single_use: singleUse,
          reason: 'dev-test grant',
        },
      } as never) as never,
      mutationContext(),
    )) as { record: Row };
    const id = String(created.record.id);
    grants.push(id);
    return id;
  };
  const sql = async (statement: string): Promise<Row> => {
    const response = await fetch(DEV_GRAPHQL.replace('/v1/graphql', '/v2/query'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': devAdminSecret() },
      body: JSON.stringify({ type: 'run_sql', args: { source: 'default', sql: statement } }),
    });
    expect(response.ok, await response.clone().text()).toBe(true);
    return (await response.json()) as Row;
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
      profiles(where: { status: { _eq: active }, profile_type: { _eq: visitor } }, order_by: { code: asc }, limit: 6) { id }
      access_points(where: { status: { _eq: active } }, order_by: { name: asc }, limit: 6) { id }
    }`);
    const people = (data.profiles as { id: string }[]).map((r) => r.id);
    const doors = (data.access_points as { id: string }[]).map((r) => r.id);
    // A visitor at a door where nothing allows or denies them by policy (the decision is recorded and cleaned up).
    for (const p of people) {
      for (const d of doors) {
        person = p;
        door = d;
        if ((await check()).reason === 'no_rule') return;
      }
    }
    throw new Error('No seeded visitor without a policy at a seeded door');
  }, 120_000);

  afterAll(async () => {
    if (decisions.length === 0 && grants.length === 0) return;
    const ids = (values: readonly string[]) => (values.length === 0 ? "'00000000-0000-0000-0000-000000000000'" : values.map((v) => `'${v}'`).join(', '));
    const events = `(select e.id from itap.events e where e.access_decision_id in (${ids(decisions)}))`;
    await sql(
      [
        "select set_config('itap.retention_context', 'on', true)",
        `delete from itap.notification_deliveries where event_id in ${events}`,
        `delete from itap.user_notifications where event_id in ${events}`,
        `delete from itap.webhook_deliveries where event_id in ${events}`,
        `delete from itap.incident_events where event_id in ${events}`,
        `delete from itap.events where access_decision_id in (${ids(decisions)})`,
        `delete from itap.access_decisions where id in (${ids(decisions)})`,
        `delete from itap.access_grants where id in (${ids(grants)})`,
        // After the grants: deleting one writes its own audit row.
        `delete from itap.audit_log where entity = 'access_grants' and entity_id in (${ids(grants)})`,
      ].join('; '),
    );
    const left = (await sql(
      `select (select count(*) from itap.access_decisions where id in (${ids(decisions)}))
         + (select count(*) from itap.access_grants where id in (${ids(grants)}))
         + (select count(*) from itap.audit_log where entity = 'access_grants' and entity_id in (${ids(grants)}))`,
    )) as { result: string[][] };
    expect(left.result[1]?.[0]).toBe('0');
  }, 60_000);

  it('should let a grant decide, and deny again once it is revoked with a reason', async () => {
    const id = await grant(false);
    const granted = await check();
    expect(granted).toMatchObject({ result: 'granted', reason: 'grant' });
    const trace = (await custom('queries', 'decisionTrace', { decisionId: granted.id })) as Row;
    expect(trace).toMatchObject({ grant_id: id, profile_id: person, access_point_id: door });
    expect(traceOf(trace.signals)).toMatchObject({ decidedBy: 'grant', grants: [{ id, singleUse: false, applied: true, consumed: false }] });

    const byGrant = await list(ACCESS_DECISION_RESOURCE, { field: 'grant_id', op: 'eq', value: id }, { kind: 'cursor', limit: 10 });
    expect(byGrant.map((row) => row.id)).toEqual([granted.id]);

    expect(await custom('mutations', 'revokeAccessGrant', { grantId: id, reason: 'Visit cancelled' })).toMatchObject({ id });
    expect(await one(ACCESS_GRANT_RESOURCE, id)).toMatchObject({ revoke_reason: 'Visit cancelled', revoked_at: expect.any(String) });
    const denied = await check();
    expect(denied.result).toBe('denied');
    expect(denied.reason).not.toBe('grant');
    await expect(custom('mutations', 'revokeAccessGrant', { grantId: id, reason: 'Again' })).rejects.toMatchObject({ code: 'access_grant_revoked' });
  }, 60_000);

  it('should use up a single-use grant at its first decision', async () => {
    const id = await grant(true);
    expect(await one(ACCESS_GRANT_RESOURCE, id)).toMatchObject({ single_use: true, used_at: null });
    const granted = await check();
    expect(granted).toMatchObject({ result: 'granted', reason: 'grant' });
    expect(await custom('queries', 'decisionTrace', { decisionId: granted.id })).toMatchObject({ grant_id: id });
    expect((await one(ACCESS_GRANT_RESOURCE, id)).used_at).toEqual(expect.any(String));
    expect((await check()).result).toBe('denied');
  }, 60_000);

  it('should read a version with its policy’s archived flag', async () => {
    const [version] = await list(ACCESS_POLICY_VERSION_RESOURCE, { field: 'status', op: 'eq', value: 'published' }, offsetPage(1, 1));
    expect(version?.policy).toEqual({ is_archived: expect.any(Boolean) });
    expect((await one(ACCESS_POLICY_VERSION_RESOURCE, String(version?.id))).policy).toEqual({ is_archived: expect.any(Boolean) });
  }, 30_000);
});
