import type { AuthResult } from '@burojs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type ScopeDataSession,
  type ScopeResolver,
  applyFacility,
  facilityStorageKey,
  performOrganizationSwitch,
  readStoredFacility,
} from '../../src/app/scope';
import type { ItapAuthProvider } from '../../src/auth';

const NOVA = '11111111-1111-4111-8111-111111111111';
const RIVER = '22222222-2222-4222-8222-222222222222';
const FAC = '33333333-3333-4333-8333-333333333333';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function fakeSession() {
  return {
    replaceScope: vi.fn(async () => undefined),
    rotateSession: vi.fn(async () => undefined),
  } satisfies ScopeDataSession;
}

function fakeResolver() {
  return { setSlice: vi.fn() } satisfies ScopeResolver;
}

function fakeAuth(result: AuthResult): ItapAuthProvider {
  return { switchOrganization: vi.fn(async () => result) } as unknown as ItapAuthProvider;
}

describe('applyFacility', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should narrow the data scope and set the resolver scope slice', async () => {
    const dataSession = fakeSession();
    const resolver = fakeResolver();

    await applyFacility({ dataSession, resolver }, NOVA, FAC);

    expect(dataSession.replaceScope).toHaveBeenCalledWith({ facility: FAC });
    expect(resolver.setSlice).toHaveBeenCalledWith('scope', { organization: NOVA, facility: FAC });
  });

  it('should treat "all facilities" as no value', async () => {
    const dataSession = fakeSession();
    const resolver = fakeResolver();

    await applyFacility({ dataSession, resolver }, NOVA, null);

    expect(dataSession.replaceScope).toHaveBeenCalledWith({ facility: null });
    expect(resolver.setSlice).toHaveBeenCalledWith('scope', { organization: NOVA, facility: null });
    expect(readStoredFacility(NOVA)).toBeNull();
  });

  it('should remember the choice per organization', async () => {
    const deps = { dataSession: fakeSession(), resolver: fakeResolver() };

    await applyFacility(deps, NOVA, FAC);
    await applyFacility(deps, RIVER, null);

    expect(localStorage.getItem(facilityStorageKey(NOVA))).toBe(FAC);
    expect(facilityStorageKey(NOVA)).toBe(`itap:facility:${NOVA}`);
    expect(readStoredFacility(NOVA)).toBe(FAC);
    expect(readStoredFacility(RIVER)).toBeNull();
  });
});

describe('performOrganizationSwitch', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should apply the new organization's facility, then rotate the data session", async () => {
    localStorage.setItem(facilityStorageKey(RIVER), FAC);
    const auth = fakeAuth({ success: true });
    const dataSession = fakeSession();
    const order: string[] = [];
    dataSession.replaceScope.mockImplementation(async () => {
      order.push('scope');
    });
    dataSession.rotateSession.mockImplementation(async () => {
      order.push('rotate');
    });

    const result = await performOrganizationSwitch(auth, dataSession, RIVER);

    expect(result).toEqual({ success: true });
    expect(auth.switchOrganization).toHaveBeenCalledWith(RIVER);
    expect(dataSession.replaceScope).toHaveBeenCalledWith({ facility: FAC });
    expect(order).toEqual(['scope', 'rotate']);
  });

  it('should return a refusal unchanged and keep the session', async () => {
    const refusal: AuthResult = {
      success: false,
      error: { kind: 'forbidden', code: 'membership-inactive', message: 'Your membership is not active.' },
    };
    const dataSession = fakeSession();

    const result = await performOrganizationSwitch(fakeAuth(refusal), dataSession, RIVER);

    expect(result).toBe(refusal);
    expect(dataSession.rotateSession).not.toHaveBeenCalled();
    expect(dataSession.replaceScope).not.toHaveBeenCalled();
  });
});
