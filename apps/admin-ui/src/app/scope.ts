import type { AuthResult } from '@burojs/core';
import type { ItapAuthProvider } from '../auth';

/**
 * The console's selection: the organization the token is for, and the
 * facility that narrows facility-bound lists (`null` = all facilities).
 * Organization isolation is the token's job; the facility is a read scope.
 */
export interface ItapScope {
  readonly organization: string | null;
  readonly facility: string | null;
}

/** The data session's scope key: the keys resources may declare in `data.scope`. */
export type ItapScopeKey = {
  readonly facility: string | null;
};

/** What the scope helpers need from the data session (structurally `DataSessionController`). */
export interface ScopeDataSession {
  replaceScope(scopeKey: ItapScopeKey): Promise<unknown>;
  rotateSession(): Promise<unknown>;
}

/** What the scope helpers need from the context resolver. */
export interface ScopeResolver {
  setSlice(key: 'scope', value: ItapScope): void;
}

const FACILITY_KEY_PREFIX = 'itap:facility:';

/** The `localStorage` key of the facility remembered for one organization. */
export function facilityStorageKey(organizationId: string): string {
  return `${FACILITY_KEY_PREFIX}${organizationId}`;
}

function storage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** The facility remembered for the organization; `null` (all facilities) when none or unreadable. */
export function readStoredFacility(organizationId: string): string | null {
  try {
    const value = storage()?.getItem(facilityStorageKey(organizationId));
    return value ? value : null;
  } catch {
    return null;
  }
}

function writeStoredFacility(organizationId: string, facilityId: string | null): void {
  try {
    const store = storage();
    if (!store) return;
    if (facilityId === null) store.removeItem(facilityStorageKey(organizationId));
    else store.setItem(facilityStorageKey(organizationId), facilityId);
  } catch {
    // Blocked or full storage only costs the remembered choice.
  }
}

/** The data session's initial scope key for the organization the stored token is for. */
export function initialScopeKey(organizationId: string | null): ItapScopeKey {
  return { facility: organizationId ? readStoredFacility(organizationId) : null };
}

/**
 * Narrows the console to one facility of the organization (or all of them):
 * the data session's scope (read by resources declaring `data.scope`) and the
 * resolver's `scope` slice (read by rules) move together, and the choice is
 * remembered per organization.
 */
export async function applyFacility(
  deps: { dataSession: ScopeDataSession; resolver: ScopeResolver },
  organizationId: string,
  facilityId: string | null,
): Promise<void> {
  writeStoredFacility(organizationId, facilityId);
  await deps.dataSession.replaceScope({ facility: facilityId });
  deps.resolver.setSlice('scope', { organization: organizationId, facility: facilityId });
}

/**
 * Switches the organization: a new organization token, then a new data
 * session (cache and drafts of the previous organization are dropped). A
 * refusal is returned unchanged for the caller to report; the current
 * organization stays.
 */
export async function performOrganizationSwitch(
  auth: Pick<ItapAuthProvider, 'switchOrganization'>,
  dataSession: Pick<ScopeDataSession, 'rotateSession'>,
  organizationId: string,
): Promise<AuthResult> {
  const result = await auth.switchOrganization(organizationId);
  if (result.success) await dataSession.rotateSession();
  return result;
}
