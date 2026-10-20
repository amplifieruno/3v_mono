import { randomUUID } from 'node:crypto';
import { encryptSecret, generateClientKey, hashSecret, serverKeys, type ServerKeys } from '../auth-service/crypto.js';
import { issueClientKey } from '../auth-service/keys.js';
import { createHasuraClient, type HasuraClient } from '../hasura/client.js';
import { historyKeyOf } from './authKeys.js';
import { AUTH_APPS, type AuthAppKey, type AuthAppSpec } from './authAppsPlan.js';
import type { SeedContext } from './tenancy.js';

/**
 * Client applications of the face authentication service (slice 9) with their bindings and keys.
 * Keys (every keyed app, once): a history key created at configuration time (signs the 30 days of seeded sessions;
 * inserted directly through the same encrypt path, since store_client_key stamps now()), then the current key through
 * the real rotate path (issueClientKey = action rotate_client_key; its plaintext is printed once to the seed log, a
 * dev-only convenience), then the history key revoked through revoke_client_key (rotation completed). Visitor
 * Check-in also keeps an expired pilot key. Needs AUTH_KEY_ENCRYPTION_KEY (the backend's value); without it no keys.
 */
export type SeedAuthAppsResult = {
  apps: Record<AuthAppKey, string>;
  /** Key the history sessions reference, per keyed app (absent without keys). */
  historyKeys: Partial<Record<AuthAppKey, string>>;
  /** Plaintext of the keys issued in this run (printed once). */
  issued: { app: string; prefix: string; secret: string }[];
  created: number;
  keysSkipped: boolean;
};

type Ids = { org: string; admin: string; configuredAt: number; segments: Map<string, string>; accessPoints: Map<string, string> };

const EXISTING = `
  query SeedAuthApps($org: uuid!) {
    client_applications(where: { organization_id: { _eq: $org } }) { id name }
    client_application_keys(where: { organization_id: { _eq: $org } }, order_by: { created_at: asc }) {
      id application_id revoked_at expires_at
    }
  }
`;
const INSERT_APP = `
  mutation SeedAuthApp($app: client_applications_insert_input!, $modes: [client_application_modes_insert_input!]!,
    $attributes: [client_application_attributes_insert_input!]!, $segments: [client_application_segments_insert_input!]!,
    $points: [client_application_access_points_insert_input!]!) {
    insert_client_applications_one(object: $app) { id }
    insert_client_application_modes(objects: $modes) { affected_rows }
    insert_client_application_attributes(objects: $attributes) { affected_rows }
    insert_client_application_segments(objects: $segments) { affected_rows }
    insert_client_application_access_points(objects: $points) { affected_rows }
  }
`;
const INSERT_KEY = `
  mutation SeedAuthKey($key: client_application_keys_insert_input!) { insert_client_application_keys_one(object: $key) { id } }
`;
const REVOKE_KEY = `
  mutation SeedRevokeKey($key: uuid!) { revoke_client_key(args: { p_key: $key }) { id } }
`;

function need(map: Map<string, string>, name: string): string {
  const id = map.get(name);
  if (!id) throw new Error(`seed: ${name} missing (face authentication bindings)`);
  return id;
}

async function createApp(ctx: SeedContext, ids: Ids, spec: AuthAppSpec): Promise<string> {
  const id = randomUUID();
  const base = { organization_id: ids.org, application_id: id };
  await ctx.admin.request(INSERT_APP, {
    app: {
      id, organization_id: ids.org, name: spec.name, description: spec.description, platform: spec.platform, status: spec.status,
      threshold: spec.threshold, threshold_min: spec.thresholdMin, threshold_max: spec.thresholdMax,
      liveness_required: spec.livenessRequired, use_work_schedules: spec.useWorkSchedules, is_sandbox: spec.isSandbox,
      created_by: ids.admin, created_at: new Date(ids.configuredAt).toISOString(),
    },
    modes: spec.modes.map((mode) => ({ ...base, mode })),
    attributes: spec.attributes.map((attribute) => ({ ...base, attribute })),
    segments: spec.segments.map((name) => ({ ...base, segment_id: need(ids.segments, name) })),
    points: spec.accessPoints.map((name) => ({ ...base, access_point_id: need(ids.accessPoints, name) })),
  });
  return id;
}

/** A key inserted directly at a past time (encrypt path: scrypt fingerprint + AES-256-GCM v2 with the prefix as AAD). */
async function pastKey(ctx: SeedContext, keys: ServerKeys, args: { org: string; app: string; admin: string; createdAt: number; expiresAt: number | null }): Promise<string> {
  const { prefix, secret } = generateClientKey();
  const data = await ctx.admin.request<{ insert_client_application_keys_one: { id: string } }>(INSERT_KEY, {
    key: {
      organization_id: args.org, application_id: args.app, key_prefix: prefix, secret_hash: hashSecret(secret),
      secret: encryptSecret(keys, secret, prefix), created_by: args.admin, created_at: new Date(args.createdAt).toISOString(),
      expires_at: args.expiresAt === null ? null : new Date(args.expiresAt).toISOString(),
    },
  });
  return data.insert_client_application_keys_one.id;
}

async function seedKeys(ctx: SeedContext, actor: HasuraClient, keys: ServerKeys, ids: Ids, key: AuthAppKey, app: string): Promise<{ history: string; issued: { app: string; prefix: string; secret: string } }> {
  const spec = AUTH_APPS[key];
  if (key === 'visitor') {
    await pastKey(ctx, keys, { org: ids.org, app, admin: ids.admin, createdAt: ids.configuredAt - 40 * 86_400_000, expiresAt: ids.configuredAt - 5 * 86_400_000 });
  }
  const history = await pastKey(ctx, keys, { org: ids.org, app, admin: ids.admin, createdAt: ids.configuredAt, expiresAt: null });
  const current = await issueClientKey(actor, keys, app, null);
  await actor.request(REVOKE_KEY, { key: history });
  return { history, issued: { app: spec.name, prefix: current.prefix, secret: current.secret } };
}

export type AuthAppIds = Ids;

export async function seedAuthApps(ctx: SeedContext, ids: Ids): Promise<SeedAuthAppsResult> {
  const actor = createHasuraClient(ctx.env, { role: 'admin', userId: ids.admin, organizationId: ids.org });
  const keyHex = ctx.env.AUTH_KEY_ENCRYPTION_KEY;
  const keys = keyHex ? serverKeys(keyHex) : null;
  const existing = await ctx.admin.request<{
    client_applications: { id: string; name: string }[];
    client_application_keys: { id: string; application_id: string; revoked_at: string | null; expires_at: string | null }[];
  }>(EXISTING, { org: ids.org });
  const byName = new Map(existing.client_applications.map((a) => [a.name, a.id]));
  const apps = {} as Record<AuthAppKey, string>;
  const historyKeys: Partial<Record<AuthAppKey, string>> = {};
  const issued: SeedAuthAppsResult['issued'] = [];
  let created = 0;
  for (const spec of Object.values(AUTH_APPS)) {
    let id = byName.get(spec.name);
    if (!id) {
      id = await createApp(ctx, ids, spec);
      created += 1;
    }
    apps[spec.key] = id;
    if (!spec.keyed) continue;
    const history = historyKeyOf(existing.client_application_keys.filter((k) => k.application_id === id));
    if (history.kind === 'seed') {
      // Without AUTH_KEY_ENCRYPTION_KEY no key can be stored (logged by the seed); history sessions then carry none.
      if (!keys) continue;
      const result = await seedKeys(ctx, actor, keys, ids, spec.key, id);
      historyKeys[spec.key] = result.history;
      issued.push(result.issued);
    } else {
      if (history.kind === 'recovered') {
        process.stdout.write(`Face auth: ${spec.name} has keys but no revoked history key (interrupted seed?); history uses its oldest key.\n`);
      }
      historyKeys[spec.key] = history.id;
    }
  }
  return { apps, historyKeys, issued, created, keysSkipped: keys === null };
}
