import { randomUUID } from 'node:crypto';
import type { HasuraClient } from '../../../src/hasura/client.js';
import { runSavedSearches } from '../../../src/search/savedSearches.js';
import { asAdmin, asOrgAdmin, orgAdminToken, testEnv } from './clients.js';
import { readFace, type FaceFixture } from './enrollment.js';
import { addEmbedding, createIdentityAsAdmin } from './faces.js';
import { addMember, createTestUser, createTwoOrgs } from './fixtures.js';
import { runSqlRows } from './sql.js';

/** Search (slice 7, task 3) helpers. */

export type SearchOutput = {
  search_request_id: string;
  status: string;
  results_count: number;
  top_confidence: number | null;
  duration_ms: number;
  face_count: number | null;
  error: string | null;
};

export type SearchArgs = {
  search_type: string;
  image_file_id?: string;
  filters?: Record<string, unknown>;
  threshold?: number;
  max_results?: number;
  fuzzy?: boolean;
};

const SEARCH = `
  mutation Search(
    $type: String!, $image: uuid, $filters: jsonb, $threshold: Float, $max: Int, $fuzzy: Boolean
  ) {
    search_faces(
      search_type: $type, image_file_id: $image, filters: $filters, threshold: $threshold, max_results: $max,
      fuzzy: $fuzzy
    ) { search_request_id status results_count top_confidence duration_ms face_count error }
  }
`;

export async function searchFaces(client: HasuraClient, args: SearchArgs): Promise<SearchOutput> {
  const data = await client.request<{ search_faces: SearchOutput }>(SEARCH, {
    type: args.search_type,
    image: args.image_file_id ?? null,
    filters: args.filters ?? null,
    threshold: args.threshold ?? null,
    max: args.max_results ?? null,
    fuzzy: args.fuzzy ?? null,
  });
  return data.search_faces;
}

export type ResultRow = { identity_id: string | null; rank: number; confidence: number | null; match_type: string };

/** Results of a request in rank order (admin secret). */
export async function results(requestId: string): Promise<ResultRow[]> {
  const data = await asAdmin().request<{ search_results: ResultRow[] }>(
    `query ($id: uuid!) {
      search_results(where: { search_request_id: { _eq: $id } }, order_by: { rank: asc }) {
        identity_id rank confidence match_type
      }
    }`,
    { id: requestId },
  );
  return data.search_results;
}

/** Uploads a face fixture as the given org admin with `metadata.kind = 'search'` (owner = the uploader). */
export async function uploadSearchImage(userId: string, orgId: string, face: FaceFixture): Promise<string> {
  const name = `search-${randomUUID()}-${face.file}`;
  const form = new FormData();
  form.append('bucket-id', orgId);
  form.append('metadata[]', JSON.stringify({ name, metadata: { kind: 'search' } }));
  form.append('file[]', new Blob([new Uint8Array(readFace(face))], { type: face.mimeType }), name);
  const res = await fetch(`${testEnv().NHOST_STORAGE_URL}/files`, {
    method: 'POST',
    headers: { authorization: `Bearer ${orgAdminToken(userId, orgId)}` },
    body: form,
  });
  if (!res.ok) throw new Error(`uploadSearchImage failed (${res.status}): ${await res.text()}`);
  const body = (await res.json()) as { processedFiles?: { id: string }[] };
  const id = body.processedFiles?.[0]?.id;
  if (!id) throw new Error('uploadSearchImage: no processed file');
  return id;
}

/** The stored template embedding of an identity (as numbers). */
export async function templateOf(identityId: string): Promise<number[]> {
  const [row] = await runSqlRows(
    `SELECT embedding::text AS e FROM itap.identity_embeddings WHERE identity_id = '${identityId}' ORDER BY quality_score DESC LIMIT 1`,
  );
  return JSON.parse(row.e ?? '[]') as number[];
}

/** A unit vector whose cosine similarity to the unit vector `base` is exactly `similarity`. */
export function atSimilarity(base: number[], similarity: number, axisIndex = 7): number[] {
  const norm = Math.hypot(...base);
  const unit = base.map((x) => x / norm);
  const u = unit.map((x, i) => (i === axisIndex ? 1 : 0) - unit[axisIndex] * x);
  const uNorm = Math.hypot(...u);
  const sin = Math.sqrt(1 - similarity * similarity);
  return unit.map((x, i) => similarity * x + sin * (u[i] / uNorm));
}

/** An identity (admin + org session) with one template at `values`. */
export async function identityAt(orgId: string, values: number[], object: Record<string, unknown> = {}): Promise<string> {
  const { id } = await createIdentityAsAdmin(orgId, object);
  await addEmbedding(orgId, id, values, 0.9);
  return id;
}

/**
 * The `run_saved_searches` cron run in-process for the given organizations only (the dev database is shared with the
 * demo seed): due saved searches of other organizations are filtered out.
 */
export async function runSavedSearchCron(orgIds: string[], scheduledTime: string): Promise<Record<string, unknown>> {
  const admin = asAdmin();
  const scoped: HasuraClient = {
    request: async <T>(query: string, variables?: Record<string, unknown>) => {
      const data = await admin.request<T>(query, variables);
      const list = (data as { saved_searches?: { organization_id: string }[] }).saved_searches;
      if (list) (data as Record<string, unknown>).saved_searches = list.filter((r) => orgIds.includes(r.organization_id));
      return data;
    },
  };
  const id = randomUUID();
  const result = await runSavedSearches.handle(
    { id, name: 'run_saved_searches', scheduled_time: scheduledTime, payload: {}, comment: null },
    { env: testEnv(), admin: scoped, idempotencyKey: `run_saved_searches:${id}` },
  );
  return { ...result };
}

export type SavedSearchState = {
  last_run_at: string | null;
  next_run_at: string | null;
  last_run_status: string | null;
  last_error: string | null;
  last_search_request_id: string | null;
};

export async function savedSearchState(id: string): Promise<SavedSearchState> {
  const data = await asAdmin().request<{ saved_searches_by_pk: SavedSearchState }>(
    `query ($id: uuid!) {
      saved_searches_by_pk(id: $id) { last_run_at next_run_at last_run_status last_error last_search_request_id }
    }`,
    { id },
  );
  return data.saved_searches_by_pk;
}

/** saved_search_match events of an organization: identity and dedup key, oldest first. */
export type MatchEvent = { identity_id: string | null; dedup_key: string | null; occurred_at: string };

export async function matchEvents(orgId: string): Promise<MatchEvent[]> {
  const data = await asAdmin().request<{ events: MatchEvent[] }>(
    `query ($org: uuid!) {
      events(where: { organization_id: { _eq: $org }, event_type: { _eq: saved_search_match } },
             order_by: [{ occurred_at: asc }, { dedup_key: asc }]) { identity_id dedup_key occurred_at }
    }`,
    { org: orgId },
  );
  return data.events;
}

export const INSERT_SAVED_SEARCH = `
  mutation ($o: saved_searches_insert_input!) { insert_saved_searches_one(object: $o) { id owner_id next_run_at } }
`;

/** Inserts a saved search as `client` (attribute search with no filters unless overridden). */
export async function createSavedSearch(client: HasuraClient, object: Record<string, unknown>): Promise<string> {
  const data = await client.request<{ insert_saved_searches_one: { id: string } }>(INSERT_SAVED_SEARCH, {
    o: { search_type: 'attribute', filters: {}, ...object },
  });
  return data.insert_saved_searches_one.id;
}

/** Two organizations; org A has the owner (`user`, client `a`) and a colleague (client `c`). */
export async function savedSearchWorld() {
  const { orgA, orgB, user, other } = await createTwoOrgs();
  const colleague = await createTestUser();
  await addMember(orgA.id, colleague.id);
  return { orgA, orgB, user, other, colleague, a: asOrgAdmin(user.id, orgA.id), c: asOrgAdmin(colleague.id, orgA.id) };
}
