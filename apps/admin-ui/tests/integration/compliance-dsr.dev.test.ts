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
  LEGAL_HOLD_PROFILE_TARGET_RESOURCE,
  LEGAL_HOLD_RESOURCE,
  PROCESSING_ACTIVITY_DATA_CLASS_RESOURCE,
  PROCESSING_ACTIVITY_RESOURCE,
} from '../../src/data/resource-names';
import { FILES_BINDING } from '../../src/fields/open-file';
import { newRequestOf } from '../../src/modules/compliance/dsr-create-flows';
import type { DsrProgress } from '../../src/modules/compliance/dsr-steps-query';
import { retainedOf } from '../../src/modules/compliance/dsr-steps-query';
import { COMPLIANCE_BINDING } from '../../src/modules/compliance/retention-policy-ops';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, NOVA_NAME, devAdminSecret, signInDev } from '../support/dev-stack';

/**
 * Data subject requests of Nova through the console's operations, as `org_admin`, with the real
 * background job (`fulfil_dsr`):
 * - an access request for a seeded person completes with a bundle, which opens through the
 *   audited `open_file` (a short-lived link that downloads);
 * - an erasure of a THROWAWAY person created here, under a legal hold on that person, completes
 *   partially: the `retained` step names the hold, the profile is kept (restricted, not erased);
 * - a rectification is rejected (and a second rejection is refused, mapped); another is completed
 *   with its outcome; Retry on a request the job did not give up on is refused (mapped);
 * - a due date beyond 90 days is refused (mapped);
 * - a processing activity is recorded with a data class (a second one of the class is refused), read
 *   back with the seeded DPIA files untouched, and deleted with its classes.
 * Erasure is irreversible: it only ever touches the throwaway person. Cleanup with the admin
 * secret (requests have no delete permission, audit rows are append-only, holds are never deleted).
 */

const IDENTITY = { providerId: 'hasura', sessionKey: 'compliance-dsr-dev-test', scopeKey: null, bindingRevision: '1' } as const;
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
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!DEV_STACK_ENABLED)('data subject requests against the dev stack (Nova Tower)', () => {
  let provider: DataProvider;
  let token: () => Promise<string | null>;
  let organization = '';
  let seeded = '';
  let throwaway = '';
  const requests: string[] = [];
  const holds: string[] = [];
  const files: string[] = [];
  /** Processing activities created (deleted by the test; their audit rows by the cleanup). */
  const activities: string[] = [];

  const custom = async (binding: string, kind: 'mutations' | 'queries', operation: string, input: Row): Promise<unknown> => {
    const descriptor = { ...IDENTITY, kind: 'custom', ref: { namespace: 'default', id: operation }, resource: binding, operation, input };
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
  const sql = async (statement: string): Promise<string[][]> => {
    const response = await fetch(DEV_GRAPHQL.replace('/v1/graphql', '/v2/query'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': devAdminSecret() },
      body: JSON.stringify({ type: 'run_sql', args: { source: 'default', sql: statement } }),
    });
    expect(response.ok, await response.clone().text()).toBe(true);
    return ((await response.json()) as { result?: string[][] }).result ?? [];
  };
  const graphql = async (query: string, variables: Row = {}): Promise<Row> => {
    const response = await fetch(DEV_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ query, variables }),
    });
    const body = (await response.json()) as { data?: Row; errors?: unknown[] };
    expect(body.errors, JSON.stringify(body.errors)).toBeUndefined();
    return body.data ?? {};
  };
  const file = async (type: Parameters<typeof newRequestOf>[0], profileId: string, extra: Row = {}, details: Row = {}): Promise<string> => {
    const filed = (await custom(COMPLIANCE_BINDING, 'mutations', 'createDataSubjectRequest', newRequestOf(type, { profile_id: profileId, ...extra }, details))) as {
      id: string;
      code: string;
    };
    expect(filed.code).toMatch(/^DSR-\d{5}$/);
    requests.push(filed.id);
    return filed.id;
  };
  const progress = async (requestId: string): Promise<DsrProgress> =>
    (await custom(COMPLIANCE_BINDING, 'queries', 'dataSubjectRequestProgress', { requestId })) as DsrProgress;
  /** Reads the request until `done` holds (bounded: the job picks a request up within seconds). */
  const waitFor = async (requestId: string, done: (p: DsrProgress) => boolean, timeoutMs = 120_000): Promise<DsrProgress> => {
    const until = Date.now() + timeoutMs;
    for (;;) {
      const read = await progress(requestId);
      if (done(read)) return read;
      if (Date.now() > until) throw new Error(`request ${requestId} still ${read.status}: ${read.steps.map((s) => s.step).join(', ')}`);
      await pause(1500);
    }
  };
  const refusedCode = async (promise: Promise<unknown>): Promise<unknown> => {
    const error = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).not.toBeNull();
    return error;
  };

  beforeAll(async () => {
    const auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    token = () => auth.getToken();
    provider = createItapHasuraProvider(token, DEV_GRAPHQL);
    const data = await graphql(`{
      organizations { id name }
      profiles(where: { erased_at: { _is_null: true }, processing_restricted: { _eq: false }, profile_type: { _eq: employee } }, order_by: { code: asc }, limit: 1) { id }
    }`);
    organization = String((data.organizations as { id: string; name: string }[]).find((o) => o.name === NOVA_NAME)?.id ?? '');
    seeded = String((data.profiles as { id: string }[])[0]?.id ?? '');
    expect(organization).not.toBe('');
    expect(seeded).not.toBe('');
    const created = await graphql(
      `mutation Throwaway($object: profiles_insert_input!) { insert_profiles_one(object: $object) { id } }`,
      { object: { first_name: 'Dsr', last_name: `Throwaway ${Date.now()}`, profile_type: 'visitor', notes: 'compliance-dsr dev test: throwaway subject' } },
    );
    throwaway = String((created.insert_profiles_one as { id: string }).id);
  }, 60_000);

  afterAll(async () => {
    const quoted = (ids: readonly string[]) => ids.map((id) => `'${id}'`).join(', ');
    const statements = ["select set_config('itap.retention_context', 'on', true)"];
    if (requests.length > 0) {
      statements.push(`delete from itap.data_subject_requests where id in (${quoted(requests)})`);
      statements.push(
        `delete from itap.audit_log where entity_id in (${quoted(requests)}) or changes ->> 'request_id' in (${quoted(requests)})`,
      );
    }
    if (files.length > 0) {
      statements.push(`delete from itap.audit_log where entity_id in (${quoted(files)}) or changes ->> 'file_id' in (${quoted(files)})`);
      statements.push(`select itap.enqueue_unused_files('${organization}', array[${quoted(files)}]::uuid[], 'test:compliance-dsr')`);
    }
    if (holds.length > 0) {
      statements.push(`update itap.legal_holds set ends_at = now() where id in (${quoted(holds)}) and (ends_at is null or ends_at > now())`);
      statements.push(`delete from itap.legal_hold_targets where hold_id in (${quoted(holds)})`);
      statements.push(`delete from itap.legal_holds where id in (${quoted(holds)})`);
    }
    if (activities.length > 0) {
      statements.push(
        `delete from itap.audit_log where (entity = 'processing_activities' and entity_id in (${quoted(activities)})) or (entity = 'processing_activity_data_classes' and changes ->> 'activity_id' in (${quoted(activities)}))`,
      );
    }
    if (throwaway !== '') {
      statements.push(`delete from itap.profiles where id = '${throwaway}'`);
      statements.push(`delete from itap.audit_log where entity = 'profiles' and entity_id = '${throwaway}'`);
    }
    // The audit rows this cleanup itself wrote (this transaction: occurred_at from now() on) and the holds' history.
    statements.push(`delete from itap.audit_log where occurred_at >= now() and entity in ('legal_holds', 'legal_hold_targets', 'profiles')`);
    if (holds.length > 0) {
      statements.push(`delete from itap.audit_log where entity in ('legal_holds', 'legal_hold_targets') and (entity_id in (${quoted(holds)}) or changes ->> 'hold_id' in (${quoted(holds)}))`);
    }
    const started = (await sql('select now()'))[1]?.[0] ?? '';
    await sql(statements.join(';\n'));
    // Deleting the person bumps the organization's settings at commit (a deferred trigger): that audit row goes too.
    await sql(
      `select set_config('itap.retention_context', 'on', true); delete from itap.audit_log where entity = 'organization_settings' and changes = '{"retention": true}'::jsonb and occurred_at >= '${started}'`,
    );
  }, 60_000);

  it('should prepare an access bundle that opens through open_file', async () => {
    const id = await file('access', seeded, {}, {});
    const done = await waitFor(id, (p) => p.status === 'completed' || p.status === 'rejected');
    expect(done.status).toBe('completed');
    expect(done.steps.map((s) => s.step)).toEqual(expect.arrayContaining(['claimed', 'export_uploaded', 'completed']));
    const row = await graphql(`query($id: uuid!) { data_subject_requests_by_pk(id: $id) { export_file_id due_at received_at } }`, { id });
    const request = row.data_subject_requests_by_pk as { export_file_id: string | null; due_at: string; received_at: string };
    expect(Date.parse(request.due_at) - Date.parse(request.received_at)).toBe(30 * 86_400_000);
    expect(request.export_file_id).not.toBeNull();
    files.push(String(request.export_file_id));
    const opened = (await custom(FILES_BINDING, 'mutations', 'openFile', { file_id: request.export_file_id })) as { url: string };
    expect(opened.url).toMatch(/^https?:\/\//);
    const download = await fetch(opened.url);
    expect(download.status).toBe(200);
    expect(new Uint8Array(await download.arrayBuffer()).slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]));
  }, 180_000);

  it('should erase the throwaway person only partially under a legal hold (Review Focus 1)', async () => {
    const hold = await create(LEGAL_HOLD_RESOURCE, {
      name: 'DSR dev test hold',
      reason: 'compliance-dsr dev test',
      starts_at: new Date(Date.now() - 60_000).toISOString(),
    });
    holds.push(String(hold.id));
    await create(LEGAL_HOLD_PROFILE_TARGET_RESOURCE, { hold_id: hold.id, profile_id: throwaway });
    const id = await file('erasure', throwaway, { notes: 'dev test' });
    const done = await waitFor(id, (p) => p.status === 'completed' || p.status === 'rejected');
    expect(done.status).toBe('completed');
    expect(done.partial).toBe(true);
    const retained = retainedOf(done.steps);
    expect(retained?.categories).toEqual(expect.arrayContaining(['profile', 'identities']));
    expect(retained?.holdIds).toEqual([hold.id]);
    const names = (await custom(COMPLIANCE_BINDING, 'queries', 'legalHoldNames', { holdIds: retained?.holdIds ?? [] })) as Row;
    expect(names[String(hold.id)]).toBe('DSR dev test hold');
    const person = await graphql(`query($id: uuid!) { profiles_by_pk(id: $id) { erased_at processing_restricted last_name } }`, { id: throwaway });
    expect(person.profiles_by_pk).toMatchObject({ erased_at: null, processing_restricted: true });
  }, 180_000);

  it('should reject a rectification, refuse a second rejection, and complete another', async () => {
    const rejected = await file('rectification', throwaway, {}, { request: 'Last name misspelt' });
    await waitFor(rejected, (p) => p.steps.some((s) => s.step === 'awaiting_rectification'));
    expect(await custom(COMPLIANCE_BINDING, 'mutations', 'rejectDataSubjectRequest', { requestId: rejected, reason: 'Identity not verified' })).toMatchObject({
      status: 'rejected',
    });
    expect(
      await refusedCode(custom(COMPLIANCE_BINDING, 'mutations', 'rejectDataSubjectRequest', { requestId: rejected, reason: 'Again' })),
    ).toMatchObject({ kind: 'validation', code: 'dsr_closed' });

    const completed = await file('rectification', throwaway, {}, { request: 'Department' });
    await waitFor(completed, (p) => p.steps.some((s) => s.step === 'awaiting_rectification'));
    expect(
      await refusedCode(custom(COMPLIANCE_BINDING, 'mutations', 'retryDataSubjectRequest', { requestId: completed })),
    ).toMatchObject({ kind: 'validation', code: 'dsr_not_failed' });
    expect(await custom(COMPLIANCE_BINDING, 'mutations', 'completeDataSubjectRequest', { requestId: completed, outcome: 'Department corrected' })).toMatchObject({
      status: 'completed',
    });
    const row = await graphql(`query($id: uuid!) { data_subject_requests_by_pk(id: $id) { outcome details } }`, { id: completed });
    expect(row.data_subject_requests_by_pk).toEqual({ outcome: 'Department corrected', details: { request: 'Department' } });
  }, 180_000);

  it('should refuse a due date beyond 90 days', async () => {
    const received = new Date(Date.now() - 60_000).toISOString();
    const late = new Date(Date.parse(received) + 120 * 86_400_000).toISOString();
    const error = await refusedCode(
      custom(COMPLIANCE_BINDING, 'mutations', 'createDataSubjectRequest', { ...newRequestOf('access', { profile_id: throwaway, received_at: received }), due_at: late }),
    );
    expect(error).toMatchObject({ kind: 'validation' });
    expect(JSON.stringify(error)).toContain('at most 90 days');
  });

  it('should record a processing activity with its data classes and delete it', async () => {
    const activity = await create(PROCESSING_ACTIVITY_RESOURCE, {
      name: 'DSR dev test activity',
      purpose: 'compliance-dsr dev test',
      legal_basis: 'legitimate_interests',
      dpia_status: 'required',
      is_active: true,
    });
    expect(String(activity.code)).toMatch(/^PA-\d{5}$/);
    await create(PROCESSING_ACTIVITY_DATA_CLASS_RESOURCE, { activity_id: activity.id, data_class: 'detections' });
    await expect(create(PROCESSING_ACTIVITY_DATA_CLASS_RESOURCE, { activity_id: activity.id, data_class: 'detections' })).rejects.toBeDefined();
    const read = await graphql(`query($id: uuid!) { processing_activities_by_pk(id: $id) { legal_basis dpia_status data_classes { data_class } } }`, { id: activity.id });
    expect(read.processing_activities_by_pk).toEqual({ legal_basis: 'legitimate_interests', dpia_status: 'required', data_classes: [{ data_class: 'detections' }] });
    await provider.mutations?.deleteOne?.(
      createMutationDescriptor({ ...IDENTITY, kind: 'deleteOne', ref: { namespace: 'default', id: PROCESSING_ACTIVITY_RESOURCE }, resource: PROCESSING_ACTIVITY_RESOURCE, idField: 'id', id: activity.id } as never) as never,
      mutationContext(),
    );
    const gone = await graphql(`query($id: uuid!) { processing_activities_by_pk(id: $id) { id } processing_activity_data_classes(where: { activity_id: { _eq: $id } }) { id } }`, { id: activity.id });
    expect(gone).toEqual({ processing_activities_by_pk: null, processing_activity_data_classes: [] });
    activities.push(String(activity.id));
  });
});
