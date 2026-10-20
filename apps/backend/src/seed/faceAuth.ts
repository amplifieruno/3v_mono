import type { EnrollmentDeps } from '../face/enrollmentService.js';
import { createInsightFaceClient } from '../face/insightFaceClient.js';
import { createHasuraClient } from '../hasura/client.js';
import { seedAuthApps } from './authApps.js';
import { seedAuthHistory, type SeedAuthHistoryResult } from './authHistory.js';
import { loadPools } from './authPools.js';
import { seedSyntheticIdentities, type SeedSyntheticResult } from './authSynthetic.js';
import { SEED_FACILITIES } from './facilityPlan.js';
import { configurationTime } from './historyTime.js';
import type { SeedContext, SeedTenancyResult } from './tenancy.js';

/**
 * Face authentication service seed (slice 9, design §9), two steps: seedSandboxIdentities (before the segments step,
 * so the sandbox segment gets its daily stats with the others) creates the synthetic identities (generated faces
 * through the enrollment steps) and their segment; seedFaceAuth creates the five client applications with bindings
 * and keys, then 30 days of attempts through the real decision engine (authHistory.ts). Idempotent: apps by name,
 * synthetic identities by seed_ref, keys only for apps without any, the history only while the seeded apps have no
 * attempts.
 */
export type SeedFaceAuthResult = {
  appsCreated: number;
  issuedKeys: { app: string; prefix: string; secret: string }[];
  keysSkipped: boolean;
  history: SeedAuthHistoryResult | null;
  durationMs: number;
};

const LOOKUPS = `
  query SeedFaceAuthLookups($org: uuid!) {
    segments(where: { organization_id: { _eq: $org } }) { id name }
    access_points(where: { organization_id: { _eq: $org } }) { id name }
  }
`;
const ATTEMPTS = `
  query SeedFaceAuthAttempts($apps: [uuid!]!) {
    authentication_attempts_aggregate(where: { application_id: { _in: $apps } }) { aggregate { count } }
  }
`;

type Named = { id: string; name: string };

export async function seedSandboxIdentities(ctx: SeedContext, tenancy: SeedTenancyResult): Promise<SeedSyntheticResult> {
  const org = tenancy.orgs.nova;
  const deps: EnrollmentDeps = {
    clients: { admin: ctx.admin, actor: createHasuraClient(ctx.env, { role: 'admin', userId: tenancy.users.admin, organizationId: org }) },
    storage: ctx.storage,
    insightFace: createInsightFaceClient(ctx.env.INSIGHTFACE_API_URL),
    organizationId: org,
  };
  const configuredAt = configurationTime(ctx.now, SEED_FACILITIES.nova.timezone);
  return seedSyntheticIdentities(ctx, deps, { org, admin: tenancy.users.admin, configuredAt });
}

export async function seedFaceAuth(ctx: SeedContext, tenancy: SeedTenancyResult): Promise<SeedFaceAuthResult> {
  const started = Date.now();
  const org = tenancy.orgs.nova;
  const timezone = SEED_FACILITIES.nova.timezone;
  const configuredAt = configurationTime(ctx.now, timezone);
  const lookups = await ctx.admin.request<{ segments: Named[]; access_points: Named[] }>(LOOKUPS, { org });
  const toMap = (rows: Named[]) => new Map(rows.map((r) => [r.name, r.id]));
  const apps = await seedAuthApps(ctx, {
    org, admin: tenancy.users.admin, configuredAt, segments: toMap(lookups.segments), accessPoints: toMap(lookups.access_points),
  });

  const { authentication_attempts_aggregate: seeded } = await ctx.admin.request<{
    authentication_attempts_aggregate: { aggregate: { count: number } };
  }>(ATTEMPTS, { apps: Object.values(apps.apps) });
  let history: SeedAuthHistoryResult | null = null;
  if (seeded.aggregate.count === 0) {
    history = await seedAuthHistory(ctx, {
      org, reviewer: tenancy.users.novaAdmin, timezone, pools: await loadPools(ctx, org), apps: apps.apps, keys: apps.historyKeys,
      accessPoints: toMap(lookups.access_points),
    });
  }
  return { appsCreated: apps.created, issuedKeys: apps.issued, keysSkipped: apps.keysSkipped, history, durationMs: Date.now() - started };
}
