import type { BaseSession, OrgSession, StoredAuth } from './types';

export const TOKEN_STORAGE_KEY = 'itap:auth:v1';

/** What changed the store: this tab, or another tab of the same browser writing the shared storage. */
export interface TokenStoreChange {
  readonly external: boolean;
}

export type TokenStoreListener = (change: TokenStoreChange) => void;

export interface TokenStore {
  snapshot(): StoredAuth;
  setBase(session: BaseSession): void;
  setOrg(session: OrgSession | null): void;
  clear(): void;
  /** Called after every write of this tab, and after a write of another tab (the `storage` event). */
  subscribe(listener: TokenStoreListener): () => void;
}

/** Where `storage` events of other tabs arrive (the window). */
export type StorageEventSource = Pick<Window, 'addEventListener' | 'removeEventListener'>;

const EMPTY: StoredAuth = { base: null, org: null };

function defaultEvents(): StorageEventSource | undefined {
  return typeof window === 'undefined' ? undefined : window;
}

function defaultStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isBase(value: unknown): value is BaseSession {
  if (!isRecord(value) || !isRecord(value.user)) return false;
  return (
    typeof value.accessToken === 'string' &&
    typeof value.refreshToken === 'string' &&
    Number.isFinite(value.expiresAt) &&
    typeof value.user.id === 'string' &&
    typeof value.user.email === 'string' &&
    typeof value.user.displayName === 'string'
  );
}

function isOrg(value: unknown): value is OrgSession {
  return (
    isRecord(value) &&
    typeof value.accessToken === 'string' &&
    Number.isFinite(value.expiresAt) &&
    typeof value.organizationId === 'string' &&
    typeof value.role === 'string'
  );
}

function parse(raw: string | null): StoredAuth {
  if (raw === null) return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !isBase(value.base)) return EMPTY;
    return { base: value.base, org: isOrg(value.org) ? value.org : null };
  } catch {
    return EMPTY;
  }
}

/**
 * Persists the sessions to `localStorage` (or the given storage); a corrupt value reads as signed out.
 * Tabs share the storage: a sign-in, sign-out or organization switch in one tab reaches the
 * subscribers of every other tab through the `storage` event (`external: true`).
 */
export function createTokenStore(
  storage: Storage | undefined = defaultStorage(),
  events: StorageEventSource | undefined = storage ? defaultEvents() : undefined,
): TokenStore {
  const listeners = new Set<TokenStoreListener>();
  let memory: StoredAuth = EMPTY;

  const notify = (change: TokenStoreChange): void => {
    for (const listener of [...listeners]) listener(change);
  };

  /** `key` is `null` when another tab cleared the whole storage. */
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== null && event.key !== TOKEN_STORAGE_KEY) return;
    if (event.storageArea !== null && event.storageArea !== storage) return;
    notify({ external: true });
  };

  const read = (): StoredAuth => {
    if (!storage) return memory;
    try {
      return parse(storage.getItem(TOKEN_STORAGE_KEY));
    } catch {
      return EMPTY;
    }
  };

  const write = (next: StoredAuth): void => {
    memory = next;
    if (storage) {
      try {
        if (next.base) storage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(next));
        else storage.removeItem(TOKEN_STORAGE_KEY);
      } catch {
        // Storage may be full or blocked; the in-memory copy still serves this tab.
      }
    }
    notify({ external: false });
  };

  return {
    snapshot: read,
    setBase: (base) => write({ base, org: read().org }),
    setOrg: (org) => write({ base: read().base, org }),
    clear: () => write(EMPTY),
    subscribe(listener) {
      if (listeners.size === 0) events?.addEventListener('storage', onStorage);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) events?.removeEventListener('storage', onStorage);
      };
    },
  };
}
