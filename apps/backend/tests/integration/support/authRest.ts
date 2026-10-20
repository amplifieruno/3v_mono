import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { authorizationHeader } from '../../../src/auth-service/signature.js';
import type { HasuraClient } from '../../../src/hasura/client.js';
import { createStorageClient } from '../../../src/storage/storageClient.js';
import { addSegmentRows, bind } from './authDecide.js';
import { authWorld, createApp } from './authService.js';
import { testEnv } from './clients.js';
import { enrollFace, FACES, readFace, uploadFace } from './enrollment.js';
import { insertOne } from './operations.js';

/** REST client and world of the face authentication service (/v1/auth, slice 9 task 3). */

export const BASE = `http://localhost:${process.env.BACKEND_PORT ?? 3001}`;
const SEED_FACES = resolve(dirname(fileURLToPath(import.meta.url)), '../../../seed-assets/faces');

export type Key = { key_id: string; application_id: string; prefix: string; secret: string; expires_at: string | null };
export type Reply = { status: number; body: Record<string, unknown> & { error?: { code: string; retryable: boolean } } };

export async function rotateKey(client: HasuraClient, applicationId: string, expiresAt?: string): Promise<Key> {
  const data = await client.request<{ rotate_client_key: Key }>(
    `mutation($a: uuid!, $e: timestamptz) { rotate_client_key(application_id: $a, expires_at: $e) {
      key_id application_id prefix secret expires_at } }`,
    { a: applicationId, e: expiresAt ?? null },
  );
  return data.rotate_client_key;
}

/** Signed request (ITAP-HMAC); `tweak` lets a test break the signature or the clock. */
export async function call(
  key: Pick<Key, 'prefix' | 'secret'> | null,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  tweak: { ts?: number; secret?: string; prefix?: string; headers?: Record<string, string> } = {},
): Promise<Reply> {
  const raw = Buffer.from(body === undefined ? '' : JSON.stringify(body));
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(tweak.headers ?? {}) };
  if (key) {
    const ts = tweak.ts ?? Math.floor(Date.now() / 1000);
    headers.authorization = authorizationHeader(tweak.prefix ?? key.prefix, tweak.secret ?? key.secret, method, path, raw, ts);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: method === 'GET' ? undefined : raw });
  return { status: res.status, body: (await res.json()) as Reply['body'] };
}

export type OpenedSession = { session_id: string; nonce: string; device_ref: string };

export async function openSession(key: Key, input: Record<string, unknown> = {}): Promise<OpenedSession> {
  const device_ref = String(input.device_ref ?? 'kiosk-test-1');
  const reply = await call(key, 'POST', '/v1/auth/sessions', { mode: 'identification', ...input, device_ref });
  if (reply.status !== 201) throw new Error(`open session failed: ${reply.status} ${JSON.stringify(reply.body)}`);
  return { session_id: String(reply.body.session_id), nonce: String(reply.body.nonce), device_ref };
}

/** hex HMAC-SHA256(secret, nonce ‖ sha256(frames) ‖ device_ref) — what a client SDK computes. */
export function binding(secret: string, nonce: string, frames: Buffer[], deviceRef: string): string {
  const digest = createHash('sha256').update(Buffer.concat(frames)).digest();
  return createHmac('sha256', secret).update(Buffer.concat([Buffer.from(nonce, 'base64'), digest, Buffer.from(deviceRef)])).digest('hex');
}

/** POST /authenticate (or /recapture) with a correct binding unless `extra.binding` overrides it. */
export async function capture(
  key: Key,
  session: OpenedSession,
  frames: Buffer[],
  extra: Record<string, unknown> = {},
  recapture = false,
): Promise<Reply> {
  const body = {
    frames: frames.map((f) => f.toString('base64')),
    binding: binding(key.secret, session.nonce, frames, session.device_ref),
    ...extra,
  };
  return recapture
    ? call(key, 'POST', `/v1/auth/sessions/${session.session_id}/recapture`, body)
    : call(key, 'POST', '/v1/auth/authenticate', { session_id: session.session_id, ...body });
}

export const seedFace = (person: string, n: number): Buffer => readFileSync(resolve(SEED_FACES, person, `${n}.jpg`));

let variantCounter = 0;
/** A distinct JPEG of `image` (small rotation; every call yields new bytes so sequence digests never repeat). */
export async function variant(image: Buffer, angle: number): Promise<Buffer> {
  variantCounter += 1;
  const meta = await sharp(image).metadata();
  return sharp(image)
    .rotate(angle + variantCounter * 0.01, { background: '#808080' })
    .resize(meta.width, meta.height)
    .jpeg({ quality: 88 + (variantCounter % 8) })
    .toBuffer();
}

/** person-03 sequences: `high` (crops 1/2, the enrolled photos: similarity ~0.97), `low` (crops 3/4: ~0.92). */
export async function sequence(kind: 'high' | 'low'): Promise<Buffer[]> {
  const p = [1, 2, 3, 4].map((n) => seedFace('person-03', n));
  return kind === 'high'
    ? Promise.all([variant(p[0], 3), variant(p[0], -3), variant(p[1], 2)])
    : Promise.all([variant(p[3], 3), variant(p[3], -3), variant(p[2], 2)]);
}

/** Three distinct variants of one image (quality-failure sequences). */
export async function triple(image: Buffer): Promise<Buffer[]> {
  return Promise.all([variant(image, 2), variant(image, -2), variant(image, 4)]);
}

export const fixtureFace = (face: (typeof FACES)[keyof typeof FACES]) => readFace(face);

async function uploadSeedFace(org: string, person: string, n: number): Promise<string> {
  const { id } = await createStorageClient(testEnv()).upload({
    bucketId: org,
    name: `${person}-${n}.jpg`,
    mimeType: 'image/jpeg',
    data: seedFace(person, n),
  });
  return id;
}

/**
 * Org A: person-03 enrolled (crops 1, 2) on the world profile, which is in the bound profile segment; person-a
 * enrolled on a second profile in the segment; person-b enrolled on a profile outside it. `app`: identification +
 * verification, threshold 0.6 (max 0.99), attributes display_name / employee_id / photo; `key`: its client key.
 */
export async function restWorld() {
  const w = await authWorld();
  const org = w.orgA.id;
  const person = await enrollFace(w.a, w.profile, [await uploadSeedFace(org, 'person-03', 1), await uploadSeedFace(org, 'person-03', 2)]);
  const otherProfile = (await insertOne(w.a, 'profiles', { first_name: 'Ola', last_name: 'Other' })).id;
  const other = await enrollFace(w.a, otherProfile, [await uploadFace(org, FACES.personA1)]);
  const outsideProfile = (await insertOne(w.a, 'profiles', { first_name: 'Out', last_name: 'Side' })).id;
  const outside = await enrollFace(w.a, outsideProfile, [await uploadFace(org, FACES.personB)]);
  await addSegmentRows(org, w.segment.id, 'profiles', [w.profile, otherProfile]);
  await w.a.request(`mutation($id: uuid!) { update_profiles_by_pk(pk_columns: {id: $id}, _set: {employee_id: "E-0303"}) { id } }`, {
    id: w.profile,
  });
  const app = await createApp(w.a, { threshold: 0.6, threshold_min: 0.5, threshold_max: 0.99 });
  await bind(org, app.id, {
    segments: [w.segment.id],
    modes: ['identification', 'verification'],
    attributes: ['display_name', 'employee_id', 'photo'],
  });
  const key = await rotateKey(w.a, app.id);
  return { ...w, org, app, key, person: person.identity_id, other: other.identity_id, outside: outside.identity_id };
}
export type RestWorld = Awaited<ReturnType<typeof restWorld>>;

/** A second app of the world (same population), e.g. with a higher threshold; returns the app and a key. */
export async function extraApp(w: RestWorld, appExtra: Record<string, unknown>, modes = ['identification', 'verification']) {
  const app = await createApp(w.a, { threshold_min: 0.5, threshold_max: 0.99, ...appExtra });
  await bind(w.org, app.id, { segments: [w.segment.id], modes, attributes: ['display_name'] });
  return { app, key: await rotateKey(w.a, app.id) };
}

/** Public body without the per-request fields (request id, session id, timestamp). */
export const stable = (body: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(body).filter(([k]) => !['request_id', 'session_id', 'timestamp'].includes(k)));
