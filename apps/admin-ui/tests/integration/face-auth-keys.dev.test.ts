import {
  type DataProvider,
  type MutationContext,
  type QueryContext,
  createMutationDescriptor,
  createQueryDescriptor,
} from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createItapHasuraProvider } from '../../src/data/provider';
import { CLIENT_APPLICATION_KEY_RESOURCE, CLIENT_APPLICATION_RESOURCE } from '../../src/data/resource-names';
import { FACE_AUTH_BINDING } from '../../src/modules/face-auth/application-ops';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, NOVA_NAME, devAdminSecret, signInDev } from '../support/dev-stack';
import { offsetPage } from '../support/pagination';

/**
 * API keys of a new Nova application through the console's provider, as `org_admin`: two
 * rotations give two active keys and their secrets once; a third is refused by the server with
 * `client_key_limit` as the console's sentence (Review Focus 2); revoking one lets the next
 * rotation through; a revoked key cannot be revoked again; and no read as `org_admin` returns a
 * secret afterwards (Review Focus 1). Secrets are never printed. Cleanup with the admin secret:
 * the application (its keys go with it) and the audit rows of both.
 */

const IDENTITY = { providerId: 'hasura', sessionKey: 'face-auth-keys-dev-test', scopeKey: null, bindingRevision: '1' } as const;
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

describe.skipIf(!DEV_STACK_ENABLED)('client application keys against the dev stack (Nova Tower)', () => {
  let provider: DataProvider;
  let token: () => Promise<string | null>;
  let app = '';
  const secrets: string[] = [];
  const keys: string[] = [];

  const custom = async (operation: string, input: Row): Promise<unknown> => {
    const descriptor = { ...IDENTITY, kind: 'custom', ref: { namespace: 'default', id: operation }, resource: FACE_AUTH_BINDING, operation, input };
    return provider.mutations?.custom?.(createMutationDescriptor(descriptor as never) as never, mutationContext());
  };
  const listKeys = async (): Promise<Row[]> => {
    const { data } = (await provider.queries?.list?.(
      createQueryDescriptor({
        ...IDENTITY,
        kind: 'list',
        ref: { namespace: 'default', id: CLIENT_APPLICATION_KEY_RESOURCE },
        resource: CLIENT_APPLICATION_KEY_RESOURCE,
        pagination: offsetPage(1, 50),
        filter: { field: 'application_id', op: 'eq', value: app },
      } as never) as never,
      queryContext(),
    )) as { data: Row[] };
    return data;
  };
  const rotate = async (): Promise<Row> => {
    const issued = (await custom('rotateClientKey', { applicationId: app, expiresAt: null })) as Row;
    expect(issued).toMatchObject({ application_id: app, prefix: expect.stringMatching(/^[A-Za-z0-9]{8}$/), secret: expect.any(String) });
    secrets.push(String(issued.secret));
    keys.push(String(issued.key_id));
    return issued;
  };
  const sql = async (statement: string): Promise<Row> => {
    const response = await fetch(DEV_GRAPHQL.replace('/v1/graphql', '/v2/query'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': devAdminSecret() },
      body: JSON.stringify({ type: 'run_sql', args: { source: 'default', sql: statement } }),
    });
    expect(response.ok, String(response.status)).toBe(true);
    return (await response.json()) as Row;
  };
  /** A raw read as `org_admin`: the answer's text (never printed: it may only be compared). */
  const rawRead = async (query: string): Promise<string> => {
    const response = await fetch(DEV_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ query }),
    });
    return response.text();
  };

  beforeAll(async () => {
    const auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    token = () => auth.getToken();
    provider = createItapHasuraProvider(token, DEV_GRAPHQL);
    const created = (await provider.mutations?.createOne?.(
      createMutationDescriptor({
        ...IDENTITY,
        kind: 'createOne',
        ref: { namespace: 'default', id: CLIENT_APPLICATION_RESOURCE },
        resource: CLIENT_APPLICATION_RESOURCE,
        idField: 'id',
        input: { name: `dev-test keys ${Date.now().toString(36)}`, platform: 'server', threshold_min: 0.5, threshold: 0.6, threshold_max: 0.9 },
      } as never) as never,
      mutationContext(),
    )) as { record: Row };
    app = String(created.record.id);
  }, 60_000);

  afterAll(async () => {
    if (app === '') return;
    const ids = [app, ...keys].map((id) => `'${id}'`).join(', ');
    const audit = `from itap.audit_log where entity like 'client_application%' and (entity_id in (${ids}) or changes::text like '%${app}%')`;
    await sql(
      [
        "select set_config('itap.retention_context', 'on', true)",
        `delete from itap.client_applications where id = '${app}'`,
        `delete ${audit}`,
      ].join('; '),
    );
    const left = (await sql(
      `select (select count(*) from itap.client_applications where id = '${app}')
         + (select count(*) from itap.client_application_keys where application_id = '${app}')
         + (select count(*) ${audit})`,
    )) as { result: string[][] };
    expect(left.result[1]?.[0]).toBe('0');
  }, 60_000);

  it('should give two active keys, refuse a third with the limit, and rotate again after a revocation (Review Focus 2)', async () => {
    const first = await rotate();
    const second = await rotate();
    expect(first.prefix).not.toBe(second.prefix);
    expect(first.secret).not.toBe(second.secret);
    await expect(custom('rotateClientKey', { applicationId: app, expiresAt: null })).rejects.toMatchObject({
      kind: 'validation',
      code: 'client_key_limit',
      details: { issues: [{ message: { default: expect.stringMatching(/already has two active keys/) } }] },
    });
    expect(await listKeys()).toHaveLength(2);

    expect(await custom('revokeClientKey', { keyId: first.key_id })).toMatchObject({ id: first.key_id, revoked_at: expect.any(String) });
    await expect(custom('revokeClientKey', { keyId: first.key_id })).rejects.toMatchObject({ kind: 'validation', code: 'client_key_revoked' });

    const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    const third = (await custom('rotateClientKey', { applicationId: app, expiresAt: expires })) as Row;
    secrets.push(String(third.secret));
    keys.push(String(third.key_id));
    expect(new Date(String(third.expires_at)).getTime()).toBe(new Date(expires).getTime());
    await expect(custom('rotateClientKey', { applicationId: app, expiresAt: '2020-01-01T00:00:00.000Z' })).rejects.toMatchObject({
      kind: 'validation',
    });

    const rows = await listKeys();
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.revoked_at === null).map((row) => row.id).sort()).toEqual([String(second.key_id), String(third.key_id)].sort());
  }, 90_000);

  it('should never return a secret to a read afterwards (Review Focus 1)', async () => {
    expect(secrets).toHaveLength(3);
    const rows = await listKeys();
    const listed = JSON.stringify(rows);
    for (const secret of secrets) expect(listed.includes(secret)).toBe(false);
    for (const row of rows) expect(Object.keys(row).some((column) => /secret/u.test(column))).toBe(false);
    // The columns themselves are not selectable as org_admin.
    for (const column of ['secret', 'secret_hash']) {
      const answer = await rawRead(`{ client_application_keys(where: { application_id: { _eq: "${app}" } }) { id ${column} } }`);
      expect(answer).toMatch(/not found in type/);
      for (const secret of secrets) expect(answer.includes(secret)).toBe(false);
    }
    // Nor through the application, the audit trail or the key's history.
    const around = await rawRead(`{
      client_applications_by_pk(id: "${app}") { id client_application_keys { id key_prefix } }
      audit_log(where: { entity_id: { _in: ${JSON.stringify(keys)} } }) { changes }
    }`);
    expect(around.includes('"errors"')).toBe(false);
    expect(around.includes(String(keys[0]))).toBe(true);
    for (const secret of secrets) expect(around.includes(secret)).toBe(false);
  }, 60_000);
});
