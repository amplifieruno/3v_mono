import {
  type DataProvider,
  type MutationContext,
  type QueryContext,
  createMutationDescriptor,
  createQueryDescriptor,
} from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createItapHasuraProvider } from '../../src/data/provider';
import {
  CLIENT_APPLICATION_FACILITY_RESOURCE,
  CLIENT_APPLICATION_RESOURCE,
  CLIENT_APPLICATION_SEGMENT_RESOURCE,
} from '../../src/data/resource-names';
import { FACE_AUTH_BINDING } from '../../src/modules/face-auth/application-ops';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, NOVA_NAME, devAdminSecret, signInDev } from '../support/dev-stack';
import { offsetPage } from '../support/pagination';

/**
 * Client applications of Nova through the console's provider, as `org_admin`: a sandbox and a
 * production application are registered; the production one is bound to a segment and a
 * facility; the sandbox one takes a segment, and a forced facility binding is refused by the
 * database with the sandbox sentence (Review Focus 5); a duplicate binding reads "already bound";
 * suspend, reactivate and revoke change the status, and a revoked application cannot come back.
 * Both applications are deleted through the console's delete (they have no history). Cleanup with
 * the admin secret (audit rows are append-only): whatever is left of the two, and their audit rows.
 */

const IDENTITY = { providerId: 'hasura', sessionKey: 'face-auth-applications-dev-test', scopeKey: null, bindingRevision: '1' } as const;
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

describe.skipIf(!DEV_STACK_ENABLED)('client applications against the dev stack (Nova Tower)', () => {
  let provider: DataProvider;
  let token: () => Promise<string | null>;
  let segment = '';
  let facility = '';
  const apps: string[] = [];
  const run = Date.now().toString(36);

  const custom = async (operation: string, input: Row): Promise<unknown> => {
    const descriptor = { ...IDENTITY, kind: 'custom', ref: { namespace: 'default', id: operation }, resource: FACE_AUTH_BINDING, operation, input };
    return provider.mutations?.custom?.(createMutationDescriptor(descriptor as never) as never, mutationContext());
  };
  const one = async (resource: string, id: string): Promise<Row> => {
    const { data } = (await provider.queries?.one?.(
      createQueryDescriptor({ ...IDENTITY, kind: 'one', ref: { namespace: 'default', id: resource }, resource, id } as never) as never,
      queryContext(),
    )) as { data: Row };
    return data;
  };
  const list = async (resource: string, applicationId: string): Promise<Row[]> => {
    const filter = { field: 'application_id', op: 'eq', value: applicationId };
    const { data } = (await provider.queries?.list?.(
      createQueryDescriptor({
        ...IDENTITY,
        kind: 'list',
        ref: { namespace: 'default', id: resource },
        resource,
        pagination: offsetPage(1, 50),
        filter,
      } as never) as never,
      queryContext(),
    )) as { data: Row[] };
    return data;
  };
  const register = async (name: string, isSandbox: boolean): Promise<string> => {
    const created = (await provider.mutations?.createOne?.(
      createMutationDescriptor({
        ...IDENTITY,
        kind: 'createOne',
        ref: { namespace: 'default', id: CLIENT_APPLICATION_RESOURCE },
        resource: CLIENT_APPLICATION_RESOURCE,
        idField: 'id',
        input: { name, platform: 'server', threshold_min: 0.5, threshold: 0.6, threshold_max: 0.9, is_sandbox: isSandbox },
      } as never) as never,
      mutationContext(),
    )) as { record: Row };
    const id = String(created.record.id);
    apps.push(id);
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
      segments(where: { status: { _neq: archived } }, order_by: { name: asc }, limit: 1) { id }
      facilities(order_by: { name: asc }, limit: 1) { id }
    }`);
    segment = String((data.segments as { id: string }[])[0]?.id);
    facility = String((data.facilities as { id: string }[])[0]?.id);
  }, 60_000);

  afterAll(async () => {
    if (apps.length === 0) return;
    const ids = apps.map((id) => `'${id}'`).join(', ');
    const mentions = apps.map((id) => `changes::text like '%${id}%'`).join(' or ');
    await sql(
      [
        "select set_config('itap.retention_context', 'on', true)",
        `delete from itap.client_applications where id in (${ids})`,
        // After the applications: deleting one writes its own audit rows (and its bindings').
        `delete from itap.audit_log where entity like 'client_application%' and (entity_id in (${ids}) or ${mentions})`,
      ].join('; '),
    );
    const left = (await sql(
      `select (select count(*) from itap.client_applications where id in (${ids}))
         + (select count(*) from itap.audit_log where entity like 'client_application%' and (entity_id in (${ids}) or ${mentions}))`,
    )) as { result: string[][] };
    expect(left.result[1]?.[0]).toBe('0');
  }, 60_000);

  it('should bind a production application to a segment and a facility, and refuse a duplicate', async () => {
    const app = await register(`dev-test production ${run}`, false);
    expect(await one(CLIENT_APPLICATION_RESOURCE, app)).toMatchObject({ status: 'active', is_sandbox: false, code: expect.stringMatching(/^APP-/) });
    expect(await custom('bindSegment', { applicationId: app, value: segment })).toMatchObject({ id: expect.any(String) });
    expect(await custom('bindFacility', { applicationId: app, value: facility })).toMatchObject({ id: expect.any(String) });
    expect(await custom('bindMode', { applicationId: app, value: 'identification' })).toMatchObject({ id: expect.any(String) });
    expect((await list(CLIENT_APPLICATION_SEGMENT_RESOURCE, app)).map((r) => r.segment_id)).toEqual([segment]);
    expect((await list(CLIENT_APPLICATION_FACILITY_RESOURCE, app)).map((r) => r.facility_id)).toEqual([facility]);
    await expect(custom('bindSegment', { applicationId: app, value: segment })).rejects.toMatchObject({
      kind: 'validation',
      code: 'client_application_segments_key',
    });
  }, 60_000);

  it('should let a sandbox take a segment and refuse a forced facility binding with the reason (Review Focus 5)', async () => {
    const app = await register(`dev-test sandbox ${run}`, true);
    expect(await custom('bindSegment', { applicationId: app, value: segment })).toMatchObject({ id: expect.any(String) });
    await expect(custom('bindFacility', { applicationId: app, value: facility })).rejects.toMatchObject({
      kind: 'validation',
      code: 'sandbox_location_binding',
      details: { issues: [{ message: { default: expect.stringMatching(/sandbox application binds no facilities or access points/) } }] },
    });
    expect(await list(CLIENT_APPLICATION_FACILITY_RESOURCE, app)).toEqual([]);
  }, 60_000);

  it('should suspend, reactivate and revoke, and never bring a revoked application back', async () => {
    const [app] = apps;
    const status = (value: string) => custom('setClientApplicationStatus', { applicationId: app, status: value });
    expect(await status('suspended')).toMatchObject({ status: 'suspended' });
    expect(await status('active')).toMatchObject({ status: 'active' });
    expect(await status('revoked')).toMatchObject({ status: 'revoked' });
    await expect(status('active')).rejects.toMatchObject({ kind: 'validation', code: 'client_application_revoked' });
    expect((await one(CLIENT_APPLICATION_RESOURCE, String(app))).status).toBe('revoked');
  }, 60_000);

  it('should refuse to delete an application with attempts, saying to revoke it', async () => {
    const data = await graphql('{ authentication_attempts(limit: 1) { application_id } }');
    const seeded = (data.authentication_attempts as { application_id: string }[])[0]?.application_id;
    expect(seeded).toEqual(expect.any(String));
    await expect(custom('deleteClientApplication', { applicationId: seeded })).rejects.toMatchObject({
      kind: 'validation',
      details: { issues: [{ message: { default: expect.stringMatching(/Revoke the application instead/) } }] },
    });
  }, 60_000);

  it('should delete applications without history through the console’s delete', async () => {
    for (const app of apps) {
      expect(await custom('deleteClientApplication', { applicationId: app })).toEqual({ id: app });
    }
    expect(await list(CLIENT_APPLICATION_SEGMENT_RESOURCE, String(apps[0]))).toEqual([]);
  }, 60_000);
});
