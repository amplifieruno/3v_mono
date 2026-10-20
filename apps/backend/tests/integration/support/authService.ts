import { createHasuraClient, type HasuraClient } from '../../../src/hasura/client.js';
import { accessWorld } from './access.js';
import { testEnv } from './clients.js';
import { callFn, insertOne } from './operations.js';
import { manualSegment } from './segments.js';
import { runSqlRows } from './sql.js';

/** Helpers for the face authentication service schema (slice 9). */

export const APP_FIELDS = `id number code name platform status threshold threshold_min threshold_max liveness_required
  use_work_schedules is_sandbox created_by`;
export type ClientApp = {
  id: string;
  number: number;
  code: string;
  name: string;
  status: string;
  threshold: number;
  is_sandbox: boolean;
  created_by: string | null;
};

export const KEY_FIELDS = 'id application_id key_prefix created_by expires_at revoked_at revoked_by last_used_at';
export type ClientKey = {
  id: string;
  application_id: string;
  key_prefix: string;
  created_by: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
};

/** Org A (author `a`, door, segment) and org B (`b`) for the auth service tests. */
export async function authWorld() {
  const w = await accessWorld();
  const segment = await manualSegment(w.a, 'profiles');
  return { ...w, segment };
}
export type AuthWorld = Awaited<ReturnType<typeof authWorld>>;

let counter = 0;

export async function createApp(client: HasuraClient, extra: Record<string, unknown> = {}): Promise<ClientApp> {
  counter += 1;
  return insertOne<ClientApp>(
    client,
    'client_applications',
    { name: `App ${Date.now().toString(36)}-${counter}`, platform: 'kiosk', ...extra },
    APP_FIELDS,
  );
}

/** The backend action shape: admin secret plus the caller's user and organization. */
export function backendActor(userId: string, orgId: string): HasuraClient {
  return createHasuraClient(testEnv(), { role: 'admin', userId, organizationId: orgId });
}

/** A unique 8-character public key prefix. */
export function newPrefix(): string {
  counter += 1;
  return `${Date.now().toString(36).slice(-5)}${counter.toString(36).padStart(3, '0')}`.slice(-8);
}

export function storeKey(
  client: HasuraClient,
  application: string,
  extra: Record<string, unknown> = {},
): Promise<ClientKey> {
  return callFn<ClientKey>(
    client,
    'store_client_key',
    { p_application: application, p_key_prefix: newPrefix(), p_secret_hash: 'scrypt$16384$8$1$c2FsdA$aGFzaA', ...extra },
    KEY_FIELDS,
  );
}

const sqlValue = (v: unknown): string =>
  v === null ? 'NULL' : typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : typeof v === 'object' ? `'${JSON.stringify(v)}'::jsonb` : String(v);

async function insertRow(table: string, row: Record<string, unknown>): Promise<string> {
  const cols = Object.keys(row);
  const rows = await runSqlRows(
    `insert into itap.${table} (${cols.join(', ')}) values (${cols.map((c) => sqlValue(row[c])).join(', ')}) returning id`,
  );
  return String(rows[0].id);
}

/** An authentication session as the backend service opens it (SQL, admin). */
export function insertSession(orgId: string, appId: string, extra: Record<string, unknown> = {}): Promise<string> {
  return insertRow('authentication_sessions', {
    organization_id: orgId,
    application_id: appId,
    mode: 'identification',
    device_ref: 'kiosk-1',
    nonce_hash: 'a'.repeat(64),
    expires_at: new Date(Date.now() + 300_000).toISOString(),
    ...extra,
  });
}

/** An authentication attempt as the decision engine records it (SQL, admin). */
export function insertAttempt(
  orgId: string,
  appId: string,
  sessionId: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  return insertRow('authentication_attempts', {
    organization_id: orgId,
    application_id: appId,
    session_id: sessionId,
    attempt_no: 1,
    step: 'initial',
    mode: 'identification',
    outcome: 'partial_match',
    review_status: 'pending',
    failure_reason: 'below_threshold',
    attack_outcome: 'passed',
    confidence: 0.55,
    threshold_used: 0.6,
    population_size: 10,
    population_scope: { segments: [] },
    model_version: 'arcface_r100_v1',
    ...extra,
  });
}
