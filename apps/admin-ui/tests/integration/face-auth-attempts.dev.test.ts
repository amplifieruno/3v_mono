import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type DataProvider,
  type MutationContext,
  type QueryContext,
  createMutationDescriptor,
  createQueryDescriptor,
} from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ItapAuthProvider } from '../../src/auth';
import { createItapHasuraProvider } from '../../src/data/provider';
import { AUTHENTICATION_ATTEMPT_RESOURCE, AUTHENTICATION_SESSION_RESOURCE, CLIENT_APPLICATION_RESOURCE } from '../../src/data/resource-names';
import { FACE_SOURCE_KIND } from '../../src/fields/face-photos';
import { FILES_BINDING } from '../../src/fields/open-file';
import { type StorageTarget, uploadStorageFile } from '../../src/fields/storage-client';
import { FACE_AUTH_BINDING } from '../../src/modules/face-auth/application-ops';
import { REVIEW_QUEUE_FILTERS } from '../../src/modules/face-auth/attempt';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, DEV_STORAGE, NOVA_NAME, devAdminSecret, signInDev } from '../support/dev-stack';
import { probeNear } from '../support/auth-probe';
import { offsetPage } from '../support/pagination';

/**
 * Sessions, attempts, review and the tester of Nova through the console's provider, as
 * `org_admin`. A test application (identification, bound to the Employees segment) is registered.
 * "Authenticate a face": 2 frames are refused, 3 frames of a seed face (`apps/backend/seed-assets`,
 * Pexels licence) are authenticated through `authenticate_face` and the decision is the recorded
 * attempt's (Review Focus 4). Review: a pending partial match of the test application is replayed
 * through the seed-only `itap.seed_auth_flow` (admin secret: the console can never create one, its
 * sessions never recapture), found in the review queue and approved with a note through the
 * console's operation: the attempt shows the reviewer and the note, the session succeeded and
 * closed, the success event exists; a second decision is refused (Review Focus 3). A seeded
 * evidence frame opens through `open_file`. Cleanup with the admin secret: the application's
 * events and what they fanned out, digests, attempts, sessions, the application, audit rows and
 * the uploaded frames.
 */

const SEED_FACES = resolve(dirname(fileURLToPath(import.meta.url)), '../../../backend/seed-assets/faces/person-03');

const IDENTITY = { providerId: 'hasura', sessionKey: 'face-auth-attempts-dev-test', scopeKey: null, bindingRevision: '1' } as const;
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
type Filter = { readonly field: string; readonly op: string; readonly value: unknown };

describe.skipIf(!DEV_STACK_ENABLED)('face authentication sessions, review and tester against the dev stack (Nova)', () => {
  let auth: ItapAuthProvider;
  let provider: DataProvider;
  let target: StorageTarget;
  let organizationId = '';
  let userId = '';
  let app = '';
  const uploaded: string[] = [];
  const opened: string[] = [];
  const startedAt = new Date().toISOString();

  const custom = async (resource: string, operation: string, input: Row): Promise<Row> => {
    const descriptor = { ...IDENTITY, kind: 'custom', ref: { namespace: 'default', id: operation }, resource, operation, input };
    return (await provider.mutations?.custom?.(createMutationDescriptor(descriptor as never) as never, mutationContext())) as Row;
  };
  const one = async (resource: string, id: string): Promise<Row> => {
    const { data } = (await provider.queries?.one?.(
      createQueryDescriptor({ ...IDENTITY, kind: 'one', ref: { namespace: 'default', id: resource }, resource, id } as never) as never,
      queryContext(),
    )) as { data: Row };
    return data;
  };
  const list = async (resource: string, filters: readonly Filter[]): Promise<Row[]> => {
    const filter = filters.length === 1 ? filters[0] : { and: filters };
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
    const text = await response.text();
    expect(response.ok, text).toBe(true);
    return ((JSON.parse(text) as { result?: string[][] }).result ?? []).slice(1);
  };
  const graphql = async (query: string, variables: Row = {}): Promise<Row> => {
    const response = await fetch(DEV_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.getToken()}` },
      body: JSON.stringify({ query, variables }),
    });
    const body = (await response.json()) as { data?: Row; errors?: unknown[] };
    expect(body.errors, JSON.stringify(body.errors)).toBeUndefined();
    return body.data ?? {};
  };
  const frame = async (n: number): Promise<string> => {
    const bytes = new Uint8Array(readFileSync(resolve(SEED_FACES, `${n}.jpg`)));
    const { id } = await uploadStorageFile(new File([bytes], `dev-test-frame-${n}.jpg`, { type: 'image/jpeg' }), { bucket: organizationId, kind: FACE_SOURCE_KIND }, target);
    uploaded.push(id);
    return id;
  };

  beforeAll(async () => {
    auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
    target = { base: DEV_STORAGE, getToken: () => auth.getToken() };
    const identity = await auth.getIdentity({} as never);
    organizationId = identity?.organizationId ?? '';
    userId = identity?.id ?? '';
    const data = await graphql('{ segments(where: { name: { _eq: "Employees" } }) { id } }');
    const segment = String((data.segments as { id: string }[])[0]?.id);
    const created = (await provider.mutations?.createOne?.(
      createMutationDescriptor({
        ...IDENTITY,
        kind: 'createOne',
        ref: { namespace: 'default', id: CLIENT_APPLICATION_RESOURCE },
        resource: CLIENT_APPLICATION_RESOURCE,
        idField: 'id',
        input: {
          name: `dev-test tester ${Date.now().toString(36)}`,
          platform: 'server',
          threshold_min: 0.5,
          threshold: 0.6,
          threshold_max: 0.9,
          liveness_required: false,
          is_sandbox: false,
        },
      } as never) as never,
      mutationContext(),
    )) as { record: Row };
    app = String(created.record.id);
    await custom(FACE_AUTH_BINDING, 'bindSegment', { applicationId: app, value: segment });
    await custom(FACE_AUTH_BINDING, 'bindMode', { applicationId: app, value: 'identification' });
  }, 60_000);

  afterAll(async () => {
    if (app !== '') {
      const attempts = `(select id from itap.authentication_attempts where application_id = '${app}')`;
      const events = `(select e.id from itap.events e where e.dedup_key in (select 'auth:' || id from itap.authentication_attempts where application_id = '${app}'))`;
      // The bindings' ids, read first: deleting the application cascades to them and audits each by its id.
      const bindings = (
        await sql(
          `select id from itap.client_application_segments where application_id = '${app}'
           union all select id from itap.client_application_modes where application_id = '${app}'`,
        )
      ).map(([id]) => `'${id}'`);
      const audited = [`'${app}'`, ...bindings].join(', ');
      const evidence = (await sql(`select evidence_file_id from itap.authentication_attempts where application_id = '${app}' and evidence_file_id is not null`)).map(
        ([id]) => id,
      );
      await sql(
        [
          "select set_config('itap.retention_context', 'on', true)",
          `delete from itap.notification_deliveries where event_id in ${events}`,
          `delete from itap.user_notifications where event_id in ${events}`,
          `delete from itap.webhook_deliveries where event_id in ${events}`,
          `delete from itap.incident_events where event_id in ${events}`,
          `delete from itap.events where id in ${events}`,
          `delete from itap.audit_log where entity = 'authentication_attempts' and entity_id in ${attempts}`,
          `delete from itap.auth_sequence_digests where attempt_id in ${attempts}`,
          `delete from itap.authentication_attempts where application_id = '${app}'`,
          `delete from itap.authentication_sessions where application_id = '${app}'`,
          `delete from itap.client_applications where id = '${app}'`,
          `delete from itap.audit_log where entity like 'client_application%' and (entity_id in (${audited}) or changes::text like '%${app}%')`,
        ].join('; '),
      );
      const files = [...uploaded, ...evidence];
      for (const file of files) {
        await graphql('mutation ($f: uuid!) { delete_file(file_id: $f) { file_id } }', { f: file }).catch(() => undefined);
      }
      if (files.length > 0) {
        const ids = files.map((id) => `'${id}'`).join(', ');
        await sql(
          [
            "select set_config('itap.retention_context', 'on', true)",
            `delete from itap.audit_log where entity = 'files' and action = 'delete' and entity_id in (${ids}) and occurred_at >= '${startedAt}'`,
          ].join('; '),
        );
      }
      const left = await sql(
        `select (select count(*) from itap.client_applications where id = '${app}')
           + (select count(*) from itap.authentication_sessions where application_id = '${app}')
           + (select count(*) from itap.audit_log where entity like 'client_application%' and entity_id in (${audited}))
           + (select count(*) from itap.audit_log where entity = 'authentication_attempts' and occurred_at >= '${startedAt}')`,
      );
      expect(left[0]?.[0]).toBe('0');
    }
    if (opened.length > 0) {
      const files = opened.map((id) => `'${id}'`).join(', ');
      await sql(
        [
          "select set_config('itap.retention_context', 'on', true)",
          `delete from itap.audit_log where action = 'view_sensitive' and entity_id in (${files}) and occurred_at >= '${startedAt}'`,
        ].join('; '),
      );
    }
  }, 120_000);

  it('should refuse 2 frames and record 3 as an attempt whose decision the tester shows (Review Focus 4)', async () => {
    const files = [await frame(1), await frame(2), await frame(3)];
    const input = { applicationId: app, mode: 'identification', claimedIdentityId: null, accessPointId: null, threshold: null };
    await expect(custom(FACE_AUTH_BINDING, 'authenticateFace', { ...input, fileIds: files.slice(0, 2) })).rejects.toMatchObject({
      kind: 'validation',
      code: 'invalid_input',
    });
    const result = await custom(FACE_AUTH_BINDING, 'authenticateFace', { ...input, fileIds: files });
    expect(result).toMatchObject({
      request_id: expect.any(String),
      session_id: expect.any(String),
      attempt_id: expect.any(String),
      // person-03 is a seeded employee: a member of the bound Employees segment, enrolled from these photos.
      outcome: 'success',
      authenticated: true,
      identity_id: expect.any(String),
      attributes: {},
      attack_outcome: expect.any(String),
      next_step: expect.any(String),
    });
    const [attempt] = await list(AUTHENTICATION_ATTEMPT_RESOURCE, [{ field: 'session_id', op: 'eq', value: result.session_id }]);
    expect(attempt).toMatchObject({ id: result.attempt_id, outcome: result.outcome, application_id: app, threshold_used: 0.6, review_status: 'none' });
    expect(Number(attempt?.population_size)).toBeGreaterThan(0);
    expect(Number(attempt?.latency_ms)).toBeGreaterThan(0);
    expect(attempt?.confidence).toBeCloseTo(Number(result.confidence), 3);
    expect(attempt?.matched_identity_id).toBe(result.identity_id);
    const consoleSession = await one(AUTHENTICATION_SESSION_RESOURCE, String(result.session_id));
    expect(consoleSession).toMatchObject({ application_id: app, mode: 'identification', key_id: null, device_ref: `console:${userId}` });
  }, 90_000);

  it('should approve a pending partial match with a note: reviewer shown, session closed, event raised (Review Focus 3)', async () => {
    const [[member] = []] = await sql(`select identity_id from itap.auth_population('${organizationId}', '${app}', null, now()) limit 1`);
    expect(member).toBeDefined();
    const templates = (await sql(`select embedding::text from itap.identity_embeddings where identity_id = '${member}' order by is_template desc, created_at`)).map(
      ([text]) => (text ?? '').replace(/[[\]\s]/gu, '').split(',').map(Number),
    );
    const probe = `[${probeNear(templates, 0.56).map((x) => x.toFixed(7)).join(',')}]`;
    const now = Date.now() - 10_000;
    const step = (i: number) => ({
      kind: 'decide',
      at: new Date(now + i * 1000).toISOString(),
      embedding: probe,
      quality: { model_version: 'w600k_mbf', pipeline_ms: 200 },
      attack: { outcome: 'passed', details: { binding: 'valid' }, sequence_digest: randomBytes(32).toString('hex') },
    });
    const flow = {
      kind: 'session',
      application_id: app,
      session_id: randomUUID(),
      mode: 'identification',
      device_ref: 'dev-test-kiosk',
      at: new Date(now).toISOString(),
      steps: [step(1), step(2), step(3)],
    };
    const rows = await sql(
      `select id, outcome, review_status from itap.seed_auth_flow('{"x-hasura-organization-id": "${organizationId}"}'::json, '${JSON.stringify(flow)}'::jsonb)`,
    );
    expect(rows.map(([, outcome, review]) => `${outcome}/${review}`)).toEqual(['partial_match/none', 'partial_match/none', 'partial_match/pending']);
    const pending = String(rows[2]?.[0]);

    const queue = await list(AUTHENTICATION_ATTEMPT_RESOURCE, [...REVIEW_QUEUE_FILTERS, { field: 'application_id', op: 'eq', value: app }]);
    expect(queue.map((row) => row.id)).toEqual([pending]);
    expect((await one(AUTHENTICATION_SESSION_RESOURCE, flow.session_id)).status).toBe('review');

    const note = 'dev-test: badge checked by the guard';
    expect(await custom(FACE_AUTH_BINDING, 'reviewAuthenticationAttempt', { attemptId: pending, approve: true, note })).toMatchObject({
      id: pending,
      review_status: 'approved',
    });
    expect(await one(AUTHENTICATION_ATTEMPT_RESOURCE, pending)).toMatchObject({ review_status: 'approved', reviewed_by: userId, review_note: note });
    const closed = await one(AUTHENTICATION_SESSION_RESOURCE, flow.session_id);
    expect(closed.status).toBe('succeeded');
    expect(closed.closed_at).toEqual(expect.any(String));
    const events = (await graphql(`{ events(where: { dedup_key: { _eq: "auth:${pending}" } }) { event_type authentication_attempt_id } }`)).events;
    expect(events).toEqual([{ event_type: 'auth_success', authentication_attempt_id: pending }]);

    await expect(custom(FACE_AUTH_BINDING, 'reviewAuthenticationAttempt', { attemptId: pending, approve: false, note })).rejects.toMatchObject({
      kind: 'validation',
      code: 'auth_attempt_not_pending',
    });
  }, 90_000);

  it('should open a seeded evidence frame through open_file', async () => {
    const data = await graphql('{ authentication_attempts(where: { evidence_file_id: { _is_null: false } }, limit: 1) { evidence_file_id } }');
    const file = String((data.authentication_attempts as { evidence_file_id: string }[])[0]?.evidence_file_id);
    opened.push(file);
    const { url } = (await custom(FILES_BINDING, 'openFile', { file_id: file })) as { url: string };
    expect((await fetch(url)).ok).toBe(true);
  }, 30_000);
});
