import type { TokenStore } from '../auth';
import { initialScopeKey } from './scope';

export type WatchedStore = Pick<TokenStore, 'snapshot' | 'subscribe'>;

/** What the watch needs from the data session (structurally `DataSessionController`). */
export interface WatchedDataSession {
  replaceScope(scopeKey: ReturnType<typeof initialScopeKey>): Promise<unknown>;
  rotateSession(reason?: 'forced-sign-out' | 'user-change'): Promise<unknown>;
}

export interface Seen {
  readonly userId: string | null;
  readonly organizationId: string | null;
}

export function seenOf(store: WatchedStore): Seen {
  const { base, org } = store.snapshot();
  return { userId: base?.user.id ?? null, organizationId: org?.organizationId ?? null };
}

/**
 * Keeps the UI session in step with the token store when it changes behind
 * the framework's back, returning the work to do for one change:
 *
 * - the base session is gone (a rejected renewal in this tab, buro gap G10, or
 *   a sign-out in another tab): a forced sign-out rotation, so the route guard
 *   re-asks `check()` and lands on `/login`;
 * - another tab signed in as another user: a user-change rotation;
 * - another tab switched the organization: the same steps as a switch here,
 *   the new organization's facility in scope, then a new data session (cache
 *   and drafts of the previous organization dropped), so this tab never shows
 *   one organization's data while sending another's token.
 *
 * A switch made in this tab already ran those steps (`performOrganizationSwitch`).
 */
export async function followStoreChange(
  dataSession: WatchedDataSession,
  previous: Seen,
  next: Seen,
  external: boolean,
): Promise<void> {
  if (previous.userId !== null && next.userId === null) {
    await dataSession.rotateSession('forced-sign-out');
    return;
  }
  // A signed-out tab stays on its sign-in page; only a tab with a session follows another tab.
  if (!external || previous.userId === null || next.userId === null) return;
  if (previous.userId !== next.userId) {
    await dataSession.replaceScope(initialScopeKey(next.organizationId));
    await dataSession.rotateSession('user-change');
    return;
  }
  if (previous.organizationId !== next.organizationId) {
    await dataSession.replaceScope(initialScopeKey(next.organizationId));
    await dataSession.rotateSession();
  }
}
