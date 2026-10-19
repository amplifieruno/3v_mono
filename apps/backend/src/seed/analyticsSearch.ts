import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { createInsightFaceClient } from '../face/insightFaceClient.js';
import { createHasuraClient } from '../hasura/client.js';
import { runSearch, type SearchDeps } from '../search/searchService.js';
import { ALERT_SEARCH, ATTRIBUTE_SEARCHES, FACIAL_SEARCHES, localAt, SHARED_SEARCH, type FacialSearchSpec } from './analyticsPlan.js';
import { FACES_DIR, loadFaceManifest } from './faceManifest.js';
import type { SeedContext } from './tenancy.js';

/**
 * Search history of the seed (slice 7, design §9) through the real search service (InsightFace embedding,
 * itap.search_identities, request + result rows written as the searching user), back-dated afterwards: the admin's
 * face searches with crops of seeded faces (uploaded as the admin's owner-only `search` images) and attribute searches;
 * a shared attribute saved search; a private facial saved search with alert_on_match whose baseline run already
 * happened (init_saved_search + a run linked to it + finish_saved_search_run: the first run only records the
 * baseline, so the hourly cron alerts new lookalikes only). Idempotent: the history runs when the admin has no
 * searches of their own in the organization, saved searches are keyed by name; images are reused by their seed key.
 */
export type SeedSearchResult = { requests: number; savedSearches: number };

const STATE = `
  query SeedSearchState($org: uuid!, $user: uuid!) {
    search_requests_aggregate(where: {
      organization_id: { _eq: $org }, user_id: { _eq: $user }, saved_search_id: { _is_null: true }, bulk_job_id: { _is_null: true }
    }) { aggregate { count } }
    saved_searches(where: { organization_id: { _eq: $org } }) { id name }
  }
`;
const IMAGES = `
  query SeedSearchImages($bucket: String!) {
    files(where: { bucketId: { _eq: $bucket }, metadata: { _contains: { kind: "search" } } }) { id metadata }
  }
`;
const OWN_FILE = `
  mutation SeedSearchImageOwner($id: uuid!, $user: uuid!) { updateFile(pk_columns: { id: $id }, _set: { uploadedByUserId: $user }) { id } }
`;
const BACKDATE = `
  mutation SeedSearchBackdate($id: uuid!, $created: timestamptz!, $started: timestamptz!, $completed: timestamptz!) {
    update_search_requests_by_pk(pk_columns: { id: $id }, _set: { created_at: $created, started_at: $started, completed_at: $completed }) { id }
    update_search_results(where: { search_request_id: { _eq: $id } }, _set: { created_at: $completed }) { affected_rows }
  }
`;
const INSERT_SAVED = `
  mutation SeedSavedSearch($object: saved_searches_insert_input!) { insert_saved_searches_one(object: $object) { id } }
`;
const INIT_ALERT = `
  mutation SeedAlertSearch($object: saved_searches_insert_input!, $id: uuid!, $runAt: timestamptz!) {
    insert_saved_searches_one(object: $object) { id }
    init_saved_search(args: { p_saved_search: $id, p_next_run_at: $runAt }) { id }
  }
`;
const FINISH = `
  mutation SeedAlertBaseline($id: uuid!, $runAt: timestamptz!, $next: timestamptz!, $request: uuid!) {
    finish_saved_search_run(args: { p_saved_search: $id, p_run_at: $runAt, p_at: $runAt, p_next_run_at: $next, p_request: $request }) { id }
  }
`;

const HOUR = 3_600_000;
const iso = (ms: number): string => new Date(ms).toISOString();

export type SearchImages = (spec: Pick<FacialSearchSpec, 'role' | 'nth'>) => Promise<string>;

/**
 * Owner-only search image of a seeded face (the person's first crop, mirrored), uploaded once per user and face: metadata
 * {kind: search, seed_face: <folder>}; the uploader is set to the user (admin-secret uploads have none).
 */
export function searchImages(ctx: SeedContext, org: string, user: string): SearchImages {
  let cache: Promise<{ id: string; metadata: Record<string, unknown> | null }[]> | null = null;
  const manifest = loadFaceManifest();
  return async ({ role, nth }) => {
    const person = (await manifest).filter((p) => p.role === role)[nth];
    if (!person) throw new Error(`seed: no ${role} face #${nth} in the manifest`);
    cache ??= ctx.admin.request<{ files: { id: string; metadata: Record<string, unknown> | null }[] }>(IMAGES, { bucket: org }).then((d) => d.files);
    const existing = (await cache).find((f) => f.metadata?.seed_face === person.folder && f.metadata.seed_owner === user);
    if (existing) return existing.id;
    const { file } = person.files[0];
    const { id } = await ctx.storage.upload({
      bucketId: org,
      name: `search-${person.folder}-${file}`,
      mimeType: 'image/jpeg',
      // Mirrored: a different capture than the enrolled crops (realistic similarity, not an exact 1.0).
      data: await sharp(await readFile(join(FACES_DIR, person.folder, file))).flop().jpeg({ quality: 90 }).toBuffer(),
      metadata: { kind: 'search', seed_face: person.folder, seed_owner: user },
    });
    await ctx.admin.request(OWN_FILE, { id, user });
    (await cache).push({ id, metadata: { kind: 'search', seed_face: person.folder, seed_owner: user } });
    return id;
  };
}

export function searchDeps(ctx: SeedContext, org: string, user: string): SearchDeps {
  return {
    admin: ctx.admin,
    actor: createHasuraClient(ctx.env, { role: 'admin', userId: user, organizationId: org }),
    storage: ctx.storage,
    insightFace: createInsightFaceClient(ctx.env.INSIGHTFACE_API_URL),
  };
}

/** Moves a finished request (and its results) to `at`, keeping its measured duration. */
export async function backdateSearch(ctx: SeedContext, id: string, at: number, durationMs: number): Promise<void> {
  await ctx.admin.request(BACKDATE, { id, created: iso(at), started: iso(at + 150), completed: iso(at + 150 + durationMs) });
}

export async function seedSearches(
  ctx: SeedContext,
  args: { org: string; user: string; facility: string; timezone: string; images: SearchImages },
): Promise<SeedSearchResult> {
  const { org, user } = args;
  const state = await ctx.admin.request<{
    search_requests_aggregate: { aggregate: { count: number } };
    saved_searches: { id: string; name: string }[];
  }>(STATE, { org, user });
  const deps = searchDeps(ctx, org, user);
  let requests = 0;
  if (state.search_requests_aggregate.aggregate.count === 0) {
    const runs = [
      ...FACIAL_SEARCHES.map((s) => ({ at: localAt(ctx.now, args.timezone, s.daysAgo, s.minutes), facial: s, filters: null })),
      ...ATTRIBUTE_SEARCHES.map((s) => ({ at: localAt(ctx.now, args.timezone, s.daysAgo, s.minutes), facial: null, filters: s.filters(args.facility, ctx.now) })),
    ].sort((a, b) => a.at - b.at);
    for (const run of runs) {
      const input = run.facial
        ? { searchType: 'facial', imageFileId: await args.images(run.facial), maxResults: 10 }
        : { searchType: 'attribute', filters: run.filters ?? {}, maxResults: 25 };
      const outcome = await runSearch(deps, { organizationId: org, userId: user, input });
      await backdateSearch(ctx, outcome.searchRequestId, run.at, outcome.durationMs);
      requests += 1;
    }
  }

  const names = new Set(state.saved_searches.map((s) => s.name));
  let savedSearches = 0;
  if (!names.has(SHARED_SEARCH.name)) {
    await deps.actor.request(INSERT_SAVED, {
      object: { ...SHARED_SEARCH, organization_id: org, owner_id: user, created_at: iso(localAt(ctx.now, args.timezone, 6, 14 * 60 + 45)) },
    });
    savedSearches += 1;
  }
  if (!names.has(ALERT_SEARCH.name)) {
    // Baseline at the latest hourly run instant; the live cron takes over at the next one.
    const runAt = Math.floor(ctx.now.getTime() / HOUR) * HOUR;
    const id = randomUUID();
    const image = await args.images({ role: 'blacklisted', nth: 0 });
    await deps.actor.request(INIT_ALERT, {
      object: { ...ALERT_SEARCH, id, organization_id: org, owner_id: user, image_file_id: image, created_at: iso(runAt - 26 * HOUR) },
      id,
      runAt: iso(runAt),
    });
    const outcome = await runSearch(deps, {
      organizationId: org,
      userId: user,
      savedSearchId: id,
      input: { searchType: ALERT_SEARCH.search_type, imageFileId: image, maxResults: 20 },
    });
    await backdateSearch(ctx, outcome.searchRequestId, runAt, outcome.durationMs);
    await ctx.admin.request(FINISH, { id, runAt: iso(runAt), next: iso(runAt + HOUR), request: outcome.searchRequestId });
    savedSearches += 1;
    requests += 1;
  }
  return { requests, savedSearches };
}
