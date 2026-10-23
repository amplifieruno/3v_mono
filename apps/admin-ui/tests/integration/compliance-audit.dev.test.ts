import {
  type DataProvider,
  type MutationContext,
  type QueryContext,
  createMutationDescriptor,
  createQueryDescriptor,
} from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createItapHasuraProvider } from '../../src/data/provider';
import { AUDIT_ENTRY_RESOURCE, COMPANY_RESOURCE } from '../../src/data/resource-names';
import { auditDiff, auditRecordName } from '../../src/modules/compliance/audit-diff-format';
import { COMPLIANCE_BINDING } from '../../src/modules/compliance/retention-policy-ops';
import { SYSTEM_STATUS_TEXTS } from '../../src/modules/compliance/system-status-block';
import type { SystemStatus } from '../../src/modules/compliance/system-status-format';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, NOVA_NAME, devAdminSecret, signInDev } from '../support/dev-stack';
import { offsetPage } from '../support/pagination';

/**
 * System status and the audit log of Nova through the console's operations, as `org_admin`:
 * - `get_system_status` answers with the five probes, the crons and the queues, each named by a
 *   label of the page (no raw key left for the seeded platform) and a level the page knows;
 * - a THROWAWAY company is created and renamed by this test; the audit log filtered by entity,
 *   record, member and time returns exactly its two entries, and the change reads as the name
 *   before and after.
 * Cleanup with the admin secret: the company and every audit row about it.
 */

const IDENTITY = { providerId: 'hasura', sessionKey: 'compliance-audit-dev-test', scopeKey: null, bindingRevision: '1' } as const;
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
const LEVELS = new Set(['ok', 'degraded', 'down']);

describe.skipIf(!DEV_STACK_ENABLED)('system status and audit log against the dev stack (Nova Tower)', () => {
  let provider: DataProvider;
  let me = '';
  let company = '';
  const started = new Date(Date.now() - 5_000).toISOString();

  const mutate = (resource: string, input: Row) =>
    provider.mutations?.[input.kind as 'createOne']?.(
      createMutationDescriptor({ ...IDENTITY, ref: { namespace: 'default', id: resource }, resource, idField: 'id', ...input } as never) as never,
      mutationContext(),
    ) as Promise<{ record: Row }>;
  const list = async (resource: string, filter: Row): Promise<Row[]> => {
    const { data } = (await provider.queries?.list?.(
      createQueryDescriptor({
        ...IDENTITY,
        kind: 'list',
        ref: { namespace: 'default', id: resource },
        resource,
        filter,
        sort: [{ field: 'occurred_at', direction: 'desc' }],
        pagination: offsetPage(1, 50),
      } as never) as never,
      queryContext(),
    )) as { data: Row[] };
    return data;
  };
  const sql = async (statement: string): Promise<void> => {
    const response = await fetch(DEV_GRAPHQL.replace('/v1/graphql', '/v2/query'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': devAdminSecret() },
      body: JSON.stringify({ type: 'run_sql', args: { source: 'default', sql: statement } }),
    });
    expect(response.ok, await response.clone().text()).toBe(true);
  };

  beforeAll(async () => {
    const auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
    me = String((await auth.getIdentity({} as never))?.id ?? '');
    expect(me).not.toBe('');
  }, 60_000);

  afterAll(async () => {
    if (company === '') return;
    await sql(
      [
        "select set_config('itap.retention_context', 'on', true)",
        `delete from itap.companies where id = '${company}'`,
        `delete from itap.audit_log where entity = 'companies' and entity_id = '${company}'`,
      ].join(';\n'),
    );
  }, 60_000);

  it('should answer the system status with every probe, cron and queue named by the page', async () => {
    const descriptor = { ...IDENTITY, kind: 'custom', ref: { namespace: 'default', id: 'systemStatus' }, resource: COMPLIANCE_BINDING, operation: 'systemStatus', input: {} };
    const status = (await provider.queries?.custom?.(createQueryDescriptor(descriptor as never) as never, queryContext())) as SystemStatus | null;
    expect(status).not.toBeNull();
    expect(status?.checks.map((check) => check.name).sort()).toEqual(['hasura', 'insightface', 'postgres', 'storage', 'stream_server']);
    for (const check of status?.checks ?? []) expect(LEVELS.has(check.status), check.name).toBe(true);
    expect(status?.checks.find((check) => check.name === 'postgres')?.status).not.toBe('down');
    expect(status?.postgres.db_size_bytes).toBeGreaterThan(0);
    expect(status?.crons.length).toBeGreaterThan(5);
    const texts: Readonly<Record<string, string>> = SYSTEM_STATUS_TEXTS;
    const unnamed = [
      ...(status?.checks ?? []).map((check) => `check_${check.name}`),
      ...(status?.crons ?? []).map((cron) => `cron_${cron.name}`),
      ...(status?.queues ?? []).map((queue) => `queue_${queue.key}`),
    ].filter((key) => texts[key] === undefined);
    expect(unnamed).toEqual([]);
    expect(status?.queues.map((queue) => queue.key)).toContain('file_deletions');
  }, 60_000);

  it('should find a change it made by entity, record, member and time, and read it before and after', async () => {
    const name = `Dev audit test ${Date.now()}`;
    const created = await mutate(COMPANY_RESOURCE, { kind: 'createOne', input: { name, kind: 'tenant', status: 'active' } });
    company = String(created.record.id);
    await mutate(COMPANY_RESOURCE, { kind: 'updateOne', id: company, input: { name: `${name} renamed` } });

    const rows = await list(AUDIT_ENTRY_RESOURCE, {
      and: [
        { field: 'entity', op: 'eq', value: 'companies' },
        { field: 'entity_id', op: 'eq', value: company },
        { field: 'user_id', op: 'eq', value: me },
        { field: 'occurred_at', op: 'gte', value: started },
      ],
    });
    expect(rows.map((row) => row.action)).toEqual(['update', 'insert']);
    const [update, insert] = rows;
    const diff = auditDiff(update?.action, update?.changes);
    expect(diff).toEqual({
      kind: 'changes',
      rows: [{ field: 'name', before: { kind: 'text', text: name }, after: { kind: 'text', text: `${name} renamed` } }],
    });
    expect(auditRecordName(update?.changes)).toBe(`${name} renamed`);
    expect(auditDiff(insert?.action, insert?.changes).kind).toBe('created');

    // Each filter narrows on its own: another action, or a time after the change, finds nothing.
    expect(await list(AUDIT_ENTRY_RESOURCE, { and: [{ field: 'entity_id', op: 'eq', value: company }, { field: 'action', op: 'eq', value: 'delete' }] })).toEqual([]);
    const later = new Date(Date.now() + 60_000).toISOString();
    expect(await list(AUDIT_ENTRY_RESOURCE, { and: [{ field: 'entity_id', op: 'eq', value: company }, { field: 'occurred_at', op: 'gte', value: later }] })).toEqual([]);
  }, 60_000);
});
