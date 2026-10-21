import { describe, expect, it, vi } from 'vitest';
import { type WatchedDataSession, followStoreChange } from '../../src/app/session-follow';

/**
 * What the console does when the token store changes behind the framework:
 * a lost session (this tab or another) is a forced sign-out; another tab's
 * organization switch or sign-in as someone else re-scopes and rotates this
 * tab's data session, so it never mixes one organization's cache with
 * another's token. A change this tab made itself already ran its own steps.
 */

function session(): WatchedDataSession & { steps: string[] } {
  const steps: string[] = [];
  return {
    steps,
    replaceScope: vi.fn(async (scope) => {
      steps.push(`scope:${String(scope.facility)}`);
    }),
    rotateSession: vi.fn(async (reason) => {
      steps.push(`rotate:${reason ?? 'none'}`);
    }),
  };
}

const NOVA = { userId: 'u1', organizationId: 'nova' };

describe('followStoreChange', () => {
  it('should force a sign-out when the base session is gone, from this tab or another', async () => {
    for (const external of [false, true]) {
      const data = session();
      await followStoreChange(data, NOVA, { userId: null, organizationId: null }, external);
      expect(data.steps).toEqual(['rotate:forced-sign-out']);
    }
  });

  it("should re-scope and rotate on another tab's organization switch", async () => {
    const data = session();
    await followStoreChange(data, NOVA, { userId: 'u1', organizationId: 'river' }, true);
    expect(data.steps).toEqual(['scope:null', 'rotate:none']);
  });

  it('should rotate as a user change when another tab signed in as someone else', async () => {
    const data = session();
    await followStoreChange(data, NOVA, { userId: 'u2', organizationId: 'nova' }, true);
    expect(data.steps).toEqual(['scope:null', 'rotate:user-change']);
  });

  it("should leave this tab's own switch and unchanged writes alone", async () => {
    const data = session();
    await followStoreChange(data, NOVA, { userId: 'u1', organizationId: 'river' }, false);
    await followStoreChange(data, NOVA, NOVA, true);
    await followStoreChange(data, { userId: null, organizationId: null }, NOVA, true);
    expect(data.steps).toEqual([]);
  });
});
