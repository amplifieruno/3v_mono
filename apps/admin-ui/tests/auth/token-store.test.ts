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

describe('token store across tabs', () => {
  /** A `storage` event as another tab's write delivers it (Node has no `StorageEvent`). */
  function storageEvent(key: string | null, storageArea: Storage | null): Event {
    return Object.assign(new Event('storage'), { key, storageArea });
  }

  it('notifies subscribers of another tab writing the session, as external', () => {
    const storage = memoryStorage();
    const events = new EventTarget();
    const store = createTokenStore(storage, events);
    const listener = vi.fn();
    store.subscribe(listener);

    const otherTab = createTokenStore(storage, new EventTarget());
    otherTab.setBase(base);
    otherTab.setOrg(org);
    events.dispatchEvent(storageEvent(TOKEN_STORAGE_KEY, storage));
    expect(listener).toHaveBeenCalledWith({ external: true });
    expect(store.snapshot()).toEqual({ base, org });

    store.setOrg(null);
    expect(listener).toHaveBeenLastCalledWith({ external: false });
  });

  it('notifies on a cleared storage and ignores other keys and other storages', () => {
    const storage = memoryStorage();
    const events = new EventTarget();
    const store = createTokenStore(storage, events);
    const listener = vi.fn();
    store.subscribe(listener);

    events.dispatchEvent(storageEvent('itap:facility:x', storage));
    events.dispatchEvent(storageEvent(TOKEN_STORAGE_KEY, memoryStorage()));
    expect(listener).not.toHaveBeenCalled();
    events.dispatchEvent(storageEvent(null, storage));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('stops listening to other tabs once the last subscriber leaves', () => {
    const storage = memoryStorage();
    const events = new EventTarget();
    const remove = vi.spyOn(events, 'removeEventListener');
    const store = createTokenStore(storage, events);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    expect(remove).toHaveBeenCalledWith('storage', expect.any(Function));
    events.dispatchEvent(storageEvent(TOKEN_STORAGE_KEY, storage));
    expect(listener).not.toHaveBeenCalled();
  });

  it('reads a stored organization token with a non-finite expiry as no organization', () => {
    const storage = memoryStorage();
    storage.setItem(TOKEN_STORAGE_KEY, JSON.stringify({ base, org: { ...org, expiresAt: null } }));
    expect(createTokenStore(storage).snapshot()).toEqual({ base, org: null });
  });
});
