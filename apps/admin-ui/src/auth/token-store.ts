import type { BaseSession, OrgSession, StoredAuth } from './types';

export const TOKEN_STORAGE_KEY = 'itap:auth:v1';

export interface TokenStore {
  snapshot(): StoredAuth;
  setBase(session: BaseSession): void;
  setOrg(session: OrgSession | null): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
}

const EMPTY: StoredAuth = { base: null, org: null };

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
    typeof value.expiresAt === 'number' &&
    typeof value.user.id === 'string' &&
    typeof value.user.email === 'string' &&
    typeof value.user.displayName === 'string'
  );
}

function isOrg(value: unknown): value is OrgSession {
  return (
    isRecord(value) &&
    typeof value.accessToken === 'string' &&
    typeof value.expiresAt === 'number' &&
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

/** Persists the sessions to `localStorage` (or the given storage); a corrupt value reads as signed out. */
export function createTokenStore(storage: Storage | undefined = defaultStorage()): TokenStore {
  const listeners = new Set<() => void>();
  let memory: StoredAuth = EMPTY;

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
    for (const listener of [...listeners]) listener();
  };

  return {
    snapshot: read,
    setBase: (base) => write({ base, org: read().org }),
    setOrg: (org) => write({ base: read().base, org }),
    clear: () => write(EMPTY),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
