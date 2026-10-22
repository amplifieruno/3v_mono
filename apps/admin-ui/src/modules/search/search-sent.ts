import type { FlowUnknownCheck } from '@burojs/core';
import { resourceByName } from '../../data/resource-by-name';
import { SEARCH_REQUEST_RESOURCE } from '../../data/resource-names';
import { type SearchDefinition, canonical } from './search-definition';

/**
 * "Check again" after `search_faces` lost its answer. A check sees no form values (G12), so the
 * flows remember here what they sent last; the check then looks for a request of the member's
 * own history (owner-only rows) made by hand (no saved search or bulk job) with that very
 * definition, created since shortly before it was sent. `search_requests` has no client
 * correlation id, so the definition and the window are what tell it apart.
 */

/** How far the database's clock may be behind the browser's. */
export const SENT_CLOCK_SKEW_MS = 15_000;

let lastSent: { readonly definition: SearchDefinition; readonly at: number } | null = null;

/** Called by a flow's `submit.input` with what it sends. */
export function rememberSent(definition: SearchDefinition, at: number = Date.now()): SearchDefinition {
  lastSent = { definition, at };
  return definition;
}

/** Forgets what was sent (tests). */
export function forgetSent(): void {
  lastSent = null;
}

const sameNumber = (a: unknown, b: unknown): boolean =>
  typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-6;

/**
 * Whether a stored request is the run of `sent`: the same type, photo, filters, limit and fuzzy,
 * and the threshold sent (an empty one became the organization's default on the server).
 */
export function isRunOf(row: Readonly<Record<string, unknown>>, sent: SearchDefinition): boolean {
  return (
    row.search_type === sent.search_type &&
    (row.image_file_id ?? null) === sent.image_file_id &&
    row.max_results === sent.max_results &&
    (row.fuzzy === true) === sent.fuzzy &&
    (sent.threshold === null || sameNumber(row.threshold, sent.threshold)) &&
    JSON.stringify(canonical(row.filters ?? {})) === JSON.stringify(canonical(sent.filters))
  );
}

/** Applied when the member's history holds a run by hand of what was sent last, made since it was sent. */
export const searchRan: FlowUnknownCheck = async ({ data }) => {
  const sent = lastSent;
  if (sent === null) return 'unknown';
  try {
    const { data: rows } = await data.list(resourceByName(SEARCH_REQUEST_RESOURCE) as never, {
      filter: {
        and: [
          { field: 'created_at', op: 'gte', value: new Date(sent.at - SENT_CLOCK_SKEW_MS).toISOString() },
          { field: 'search_type', op: 'eq', value: sent.definition.search_type },
          { field: 'saved_search_id', op: 'isNull' },
          { field: 'bulk_job_id', op: 'isNull' },
        ],
      },
      sort: [{ field: 'created_at', direction: 'desc' }],
      pagination: { kind: 'offset', page: 1, pageSize: 20 },
    } as never);
    const found = (rows as readonly Readonly<Record<string, unknown>>[]).some((row) => isRunOf(row, sent.definition));
    return found ? 'applied' : 'not-applied';
  } catch {
    return 'unknown';
  }
};
