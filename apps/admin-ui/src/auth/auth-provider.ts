import type { AuthProvider, AuthResult, DataError } from '@burojs/core';
import { isDataError } from '@burojs/core';
import type { NhostClient } from './nhost-client';
import type { OrgClient } from './org-client';
import type { TokenStore } from './token-store';
import type { BaseSession, ItapIdentity, LoginParams, Membership, OrgSession } from './types';

export type ItapAuthProvider = AuthProvider<ItapIdentity> & {
  /** The organization token, renewed first when it expires soon; `null` without an organization. */
  getToken(): Promise<string | null>;
  switchOrganization(organizationId: string): Promise<AuthResult>;
};

export interface ItapAuthProviderOptions {
  store: TokenStore;
  nhost: NhostClient;
  org: OrgClient;
  now?: () => number;
  renewBeforeMs?: number;
}

/** A base token this close to expiry is refreshed before it is used. */
const BASE_SKEW_MS = 5_000;

function toDataError(value: unknown): DataError {
  if (isDataError(value)) return value;
  return { kind: 'transport', code: 'unexpected-error', message: value instanceof Error ? value.message : 'Unexpected error.' };
}

function failure(value: unknown): AuthResult {
  return { success: false, error: toDataError(value) };
}

function chooseOrganization(memberships: readonly Membership[], preferred: string | null | undefined): string | null {
  const active = memberships.filter((m) => m.status === 'active');
  const wanted = active.find((m) => m.organizationId === preferred);
  if (wanted) return wanted.organizationId;
  return active.length === 1 ? (active[0]?.organizationId ?? null) : null;
}

export function createItapAuthProvider(options: ItapAuthProviderOptions): ItapAuthProvider {
  const { store, nhost, org } = options;
  const now = options.now ?? Date.now;
  const renewBeforeMs = options.renewBeforeMs ?? 60_000;

  let memberships: readonly Membership[] | null = null;
  let renewal: Promise<OrgSession | null> | null = null;

  /** A base session valid for at least a few more seconds; refreshes it when needed. */
  async function freshBase(): Promise<BaseSession | null> {
    const { base } = store.snapshot();
    if (!base) return null;
    if (base.expiresAt - now() > BASE_SKEW_MS) return base;
    const next = await nhost.refresh(base.refreshToken);
    store.setBase(next);
    return next;
  }

  async function renewOrg(): Promise<OrgSession | null> {
    const current = store.snapshot().org;
    if (!current) return null;
    const base = await freshBase();
    if (!base) return null;
    const next = await org.switchOrganization(base.accessToken, current.organizationId);
    store.setOrg(next);
    return next;
  }

  /** Single-flight renewal; an auth failure ends the session and resolves `null`. */
  function renew(): Promise<OrgSession | null> {
    renewal ??= renewOrg()
      .catch((error: unknown) => {
        const dataError = toDataError(error);
        if (dataError.kind !== 'auth') throw dataError;
        store.clear();
        memberships = null;
        return null;
      })
      .finally(() => {
        renewal = null;
      });
    return renewal;
  }

  async function loadMemberships(baseToken: string) {
    const loaded = await org.memberships(baseToken);
    memberships = loaded.memberships;
    return loaded;
  }

  return {
    async check() {
      return store.snapshot().base ? { authenticated: true } : { authenticated: false, reason: 'signed-out' };
    },

    async getIdentity() {
      const { base, org: orgSession } = store.snapshot();
      if (!base) return null;
      if (memberships === null) {
        const token = await freshBase().catch(() => null);
        if (token) await loadMemberships(token.accessToken).catch(() => undefined);
      }
      return {
        id: base.user.id,
        email: base.user.email,
        name: base.user.displayName || base.user.email,
        roles: orgSession ? [orgSession.role] : ['user'],
        organizationId: orgSession?.organizationId ?? null,
        memberships: memberships ?? [],
      };
    },

    async login(params) {
      const { email, password, organizationId } = params as LoginParams;
      try {
        const base = await nhost.signIn(email, password);
        store.setBase(base);
        store.setOrg(null);
        const loaded = await loadMemberships(base.accessToken);
        const explicit = organizationId !== undefined;
        const target = chooseOrganization(loaded.memberships, explicit ? organizationId : loaded.lastOrganizationId);
        if (target) {
          try {
            store.setOrg(await org.switchOrganization(base.accessToken, target));
          } catch (error) {
            if (explicit) throw error;
            // A remembered organization that cannot be entered any more leaves the choice to the user.
          }
        }
        return { success: true };
      } catch (error) {
        store.clear();
        memberships = null;
        return failure(error);
      }
    },

    async logout() {
      const { base } = store.snapshot();
      store.clear();
      memberships = null;
      if (base) await nhost.signOut(base.refreshToken).catch(() => undefined);
      return { success: true };
    },

    async onError(error) {
      if (error.kind !== 'auth') return { action: 'propagate', error };
      try {
        const renewed = await renew();
        return renewed ? { action: 'refreshed' } : { action: 'logout' };
      } catch {
        return { action: 'propagate', error };
      }
    },

    async getToken() {
      const current = store.snapshot().org;
      if (!current) return null;
      if (current.expiresAt - now() > renewBeforeMs) return current.accessToken;
      return (await renew())?.accessToken ?? null;
    },

    async switchOrganization(organizationId) {
      try {
        const base = await freshBase();
        if (!base) return failure({ kind: 'auth', code: 'unauthenticated', message: 'You are signed out.' });
        store.setOrg(await org.switchOrganization(base.accessToken, organizationId));
        return { success: true };
      } catch (error) {
        return failure(error);
      }
    },
  };
}
