import { describe, expect, it, vi } from 'vitest';
import { TOKEN_STORAGE_KEY, createTokenStore } from '../../src/auth/token-store';
import type { BaseSession, OrgSession } from '../../src/auth/types';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

const base: BaseSession = { accessToken: 'b', refreshToken: 'r', expiresAt: 1000, user: { id: 'u', email: 'a@b.c', displayName: 'A' } };
const org: OrgSession = { accessToken: 'o', expiresAt: 2000, organizationId: 'org-1', role: 'org_admin' };

describe('token store', () => {
  it('round-trips sessions through storage', () => {
    const storage = memoryStorage();
    const store = createTokenStore(storage);
    expect(store.snapshot()).toEqual({ base: null, org: null });
    store.setBase(base);
    store.setOrg(org);
    expect(createTokenStore(storage).snapshot()).toEqual({ base, org });
    store.clear();
    expect(createTokenStore(storage).snapshot()).toEqual({ base: null, org: null });
  });

  it('notifies subscribers until they unsubscribe', () => {
    const store = createTokenStore(memoryStorage());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.setBase(base);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.setOrg(org);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('reads corrupt storage as signed out', () => {
    const storage = memoryStorage();
    const store = createTokenStore(storage);
    storage.setItem(TOKEN_STORAGE_KEY, '{not json');
    expect(store.snapshot()).toEqual({ base: null, org: null });
    storage.setItem(TOKEN_STORAGE_KEY, JSON.stringify({ base: { accessToken: 1 } }));
    expect(store.snapshot()).toEqual({ base: null, org: null });
  });
});
