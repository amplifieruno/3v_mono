import { defineCronHandler, type TriggerContext } from '../events/types.js';
import { createInsightFaceClient } from '../face/insightFaceClient.js';
import { createHasuraClient } from '../hasura/client.js';
import { CronError, nextRun } from '../reports/cron.js';
import { errorText } from '../reports/generate.js';
import { createStorageClient } from '../storage/storageClient.js';
import { SearchError } from './options.js';
import { runSearch, type SearchDeps } from './searchService.js';

/** Page size of the due query (keyset paging by id until a short page). */
export const DUE_BATCH = 100;

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
  query DueSavedSearches($at: timestamptz!, $after: uuid!, $limit: Int!) {
    saved_searches(
      where: {
        id: { _gt: $after }, schedule_cron: { _is_null: false },
        _or: [{ next_run_at: { _is_null: true } }, { next_run_at: { _lte: $at } }]
      }
      order_by: { id: asc }
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
      organization_id: { _eq: $org }, user_id: { _eq: $user }, status: { _eq: active }, user: { disabled: { _eq: false } },
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
  mutation RecordSavedSearchRun(
    $id: uuid!, $runAt: timestamptz!, $at: timestamptz!, $next: timestamptz!, $status: String!, $error: String
  ) {
    record_saved_search_run(args: {
      p_saved_search: $id, p_run_at: $runAt, p_at: $at, p_next_run_at: $next, p_status: $status, p_error: $error
    }) { id }
  }
`;
const FINISH = `
  mutation FinishSavedSearchRun($id: uuid!, $runAt: timestamptz!, $at: timestamptz!, $next: timestamptz!, $request: uuid!) {
    finish_saved_search_run(args: {
      p_saved_search: $id, p_run_at: $runAt, p_at: $at, p_next_run_at: $next, p_request: $request
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
    await ctx.admin.request(RECORD, { id: s.id, runAt, at: at.toISOString(), next, status, error });
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
    await ctx.admin.request(FINISH, { id: s.id, runAt, at: at.toISOString(), next, request: outcome.searchRequestId });
    return outcome.status === 'completed' ? 'ran' : 'failed';
  } catch (error: unknown) {
    if (error instanceof SearchError) return record('failed', error.code);
    return record('failed', errorText(error));
  }
}

type Counts = Record<Outcome | 'unrecorded', number>;

/** Runs one page of due saved searches; a failure is recorded on its saved search (it moves on to its next run). */
async function runPage(ctx: TriggerContext, due: DueSavedSearch[], at: Date, counts: Counts): Promise<void> {
  for (const s of due) {
    try {
      counts[await runOne(ctx, s, at)] += 1;
    } catch (error: unknown) {
      const recorded =
        s.next_run_at !== null &&
        (await ctx.admin
          .request(RECORD, {
            id: s.id, runAt: s.next_run_at, at: at.toISOString(), next: nextRunText(s, at), status: 'failed', error: errorText(error),
          })
          .then(() => true, () => false));
      counts[recorded ? 'failed' : 'unrecorded'] += 1;
    }
  }
}

/**
 * Cron `run_saved_searches` (hourly, spec §8.3): saved searches with schedule_cron that are due at the scheduled time
 * run as their owner (skipped and recorded when the owner is no longer an active member or the account is disabled); with alert_on_match,
 * identities new since the previous run become saved_search_match events (SQL finish_saved_search_run). Every step
 * is guarded by next_run_at, so a retried cron run repeats nothing; one failing saved search is recorded on its row
 * and the others still run; due rows are paged by id. Run timestamps (last_run_at, event occurred_at) are the
 * scheduled time. A failure that cannot even be recorded makes the run fail (Hasura retries).
 */
export const runSavedSearches = defineCronHandler(async (payload, ctx) => {
  const at = new Date(payload.scheduled_time);
  if (Number.isNaN(at.getTime())) throw new Error(`Invalid scheduled_time: ${payload.scheduled_time}`);
  const counts: Counts = { initialized: 0, ran: 0, skipped: 0, failed: 0, unrecorded: 0 };
  let after = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const { saved_searches: due } = await ctx.admin.request<{ saved_searches: DueSavedSearch[] }>(DUE, {
      at: at.toISOString(),
      after,
      limit: DUE_BATCH,
    });
    await runPage(ctx, due, at, counts);
    if (due.length < DUE_BATCH) break;
    after = due[due.length - 1].id;
  }
  if (counts.unrecorded > 0) throw new Error(`run_saved_searches: ${counts.unrecorded} saved searches not recorded`);
  return { ...counts };
});
