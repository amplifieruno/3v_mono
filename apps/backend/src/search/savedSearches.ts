import { defineCronHandler, type TriggerContext } from '../events/types.js';
import { createInsightFaceClient } from '../face/insightFaceClient.js';
import { createHasuraClient } from '../hasura/client.js';
import { CronError, nextRun } from '../reports/cron.js';
import { errorText } from '../reports/generate.js';
import { createStorageClient } from '../storage/storageClient.js';
import { SearchError } from './options.js';
import { runSearch, type SearchDeps } from './searchService.js';

const BATCH = 100;

type DueSavedSearch = {
  id: string;
  organization_id: string;
  owner_id: string;
  schedule_cron: string;
  next_run_at: string | null;
  search_type: string;
  image_file_id: string | null;
  filters: Record<string, unknown>;
  threshold: number | null;
  max_results: number;
  fuzzy: boolean;
  organization: { timezone: string };
};

const DUE = `
  query DueSavedSearches($at: timestamptz!, $limit: Int!) {
    saved_searches(
      where: { schedule_cron: { _is_null: false }, _or: [{ next_run_at: { _is_null: true } }, { next_run_at: { _lte: $at } }] }
      order_by: [{ next_run_at: asc_nulls_first }, { id: asc }]
      limit: $limit
    ) {
      id organization_id owner_id schedule_cron next_run_at search_type image_file_id filters threshold max_results fuzzy
      organization { timezone }
    }
  }
`;
const ACTIVE_OWNER = `
  query SavedSearchOwner($org: uuid!, $user: uuid!, $at: timestamptz!) {
    organization_members(where: {
      organization_id: { _eq: $org }, user_id: { _eq: $user }, status: { _eq: active },
      _or: [{ expires_at: { _is_null: true } }, { expires_at: { _gt: $at } }]
    }) { id }
  }
`;
const INIT = `
  mutation InitSavedSearch($id: uuid!, $next: timestamptz!) {
    init_saved_search(args: { p_saved_search: $id, p_next_run_at: $next }) { id }
  }
`;
const RECORD = `
  mutation RecordSavedSearchRun($id: uuid!, $runAt: timestamptz!, $next: timestamptz!, $status: String!, $error: String) {
    record_saved_search_run(args: {
      p_saved_search: $id, p_run_at: $runAt, p_next_run_at: $next, p_status: $status, p_error: $error
    }) { id }
  }
`;
const FINISH = `
  mutation FinishSavedSearchRun($id: uuid!, $runAt: timestamptz!, $next: timestamptz!, $request: uuid!) {
    finish_saved_search_run(args: {
      p_saved_search: $id, p_run_at: $runAt, p_next_run_at: $next, p_request: $request
    }) { id }
  }
`;

/** Next run strictly after `at` in the organization timezone; `infinity` when the expression never matches. */
function nextRunText(s: DueSavedSearch, at: Date): string {
  try {
    return nextRun(s.schedule_cron, s.organization.timezone, at)?.toISOString() ?? 'infinity';
  } catch (error: unknown) {
    if (error instanceof CronError) return 'infinity';
    throw error;
  }
}

type Outcome = 'initialized' | 'ran' | 'skipped' | 'failed';

/** One due saved search: run as its owner (an active member) and hand the finished request to SQL. */
async function runOne(ctx: TriggerContext, s: DueSavedSearch, at: Date): Promise<Outcome> {
  const next = nextRunText(s, at);
  if (s.next_run_at === null) {
    await ctx.admin.request(INIT, { id: s.id, next });
    return 'initialized';
  }
  const runAt = s.next_run_at;
  const record = async (status: 'skipped' | 'failed', error: string): Promise<Outcome> => {
    await ctx.admin.request(RECORD, { id: s.id, runAt, next, status, error });
    return status;
  };

  const { organization_members: owner } = await ctx.admin.request<{ organization_members: unknown[] }>(ACTIVE_OWNER, {
    org: s.organization_id,
    user: s.owner_id,
    at: at.toISOString(),
  });
  if (owner.length === 0) return record('skipped', 'owner_inactive');
  if (s.search_type !== 'attribute' && s.image_file_id === null) return record('failed', 'image_missing');

  const deps: SearchDeps = {
    admin: ctx.admin,
    actor: createHasuraClient(ctx.env, { role: 'admin', userId: s.owner_id, organizationId: s.organization_id }),
    storage: createStorageClient(ctx.env),
    insightFace: createInsightFaceClient(ctx.env.INSIGHTFACE_API_URL),
  };
  try {
    const outcome = await runSearch(deps, {
      organizationId: s.organization_id,
      userId: s.owner_id,
      savedSearchId: s.id,
      input: {
        searchType: s.search_type,
        imageFileId: s.image_file_id,
        filters: s.filters,
        threshold: s.threshold,
        maxResults: s.max_results,
        fuzzy: s.fuzzy,
      },
    });
    await ctx.admin.request(FINISH, { id: s.id, runAt, next, request: outcome.searchRequestId });
    return outcome.status === 'completed' ? 'ran' : 'failed';
  } catch (error: unknown) {
    if (error instanceof SearchError) return record('failed', error.code);
    return record('failed', errorText(error));
  }
}

/**
 * Cron `run_saved_searches` (hourly, spec §8.3): saved searches with schedule_cron that are due at the scheduled time
 * run as their owner (skipped and recorded when the owner is no longer an active member); with alert_on_match,
 * identities new since the previous run become saved_search_match events (SQL finish_saved_search_run). Every step
 * is guarded by next_run_at, so a retried cron run repeats nothing; one failing saved search is recorded on its row
 * and the others still run. A failure that cannot even be recorded makes the run fail (Hasura retries).
 */
export const runSavedSearches = defineCronHandler(async (payload, ctx) => {
  const at = new Date(payload.scheduled_time);
  if (Number.isNaN(at.getTime())) throw new Error(`Invalid scheduled_time: ${payload.scheduled_time}`);
  const { saved_searches: due } = await ctx.admin.request<{ saved_searches: DueSavedSearch[] }>(DUE, {
    at: at.toISOString(),
    limit: BATCH,
  });
  const counts: Record<Outcome | 'unrecorded', number> = { initialized: 0, ran: 0, skipped: 0, failed: 0, unrecorded: 0 };
  for (const s of due) {
    try {
      counts[await runOne(ctx, s, at)] += 1;
    } catch (error: unknown) {
      // Record the failure on the saved search (it moves on to its next run); retried by Hasura only if that fails.
      const recorded =
        s.next_run_at !== null &&
        (await ctx.admin
          .request(RECORD, { id: s.id, runAt: s.next_run_at, next: nextRunText(s, at), status: 'failed', error: errorText(error) })
          .then(() => true, () => false));
      counts[recorded ? 'failed' : 'unrecorded'] += 1;
    }
  }
  if (counts.unrecorded > 0) throw new Error(`run_saved_searches: ${counts.unrecorded} saved searches not recorded`);
  return { ...counts };
});
