// @vitest-environment jsdom
import type { AuthResult } from '@burojs/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type * as React from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import type { ItapAuthProvider, ItapIdentity, Membership } from '../../src/auth';

const NOVA = '11111111-1111-4111-8111-111111111111';
const RIVER = '22222222-2222-4222-8222-222222222222';

afterEach(cleanup);

// jsdom has no layout APIs; the shell asks for both (mobile breakpoint, sizing).
beforeAll(() => {
  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) satisfies MediaQueryList;
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});

interface FakeState {
  signedIn: boolean;
  organizationId: string | null;
  memberships: Membership[];
  /** When set, `switchOrganization` refuses with this result. */
  refusal?: AuthResult;
  /** Identity reads that fail with a network error before one succeeds. */
  identityFailures?: number;
}

function member(organizationId: string, name: string, status = 'active'): Membership {
  return { organizationId, name, logoFileId: null, role: 'admin', status };
}

/** An in-memory auth provider: no network, the state the route guards read. */
function fakeAuth(state: FakeState): ItapAuthProvider {
  const ok: AuthResult = { success: true };
  return {
    async check() {
      return state.signedIn ? { authenticated: true } : { authenticated: false, reason: 'signed-out' };
    },
    async getIdentity(): Promise<ItapIdentity | null> {
      if (!state.signedIn) return null;
      if ((state.identityFailures ?? 0) > 0) {
        state.identityFailures = (state.identityFailures ?? 0) - 1;
        throw { kind: 'transport', code: 'network', message: 'Cannot reach the server.' };
      }
      return {
        id: 'user-1',
        email: 'admin@itap.demo',
        name: 'Admin',
        roles: state.organizationId ? ['org_admin'] : ['user'],
        organizationId: state.organizationId,
        memberships: state.memberships,
      };
    },
    async login() {
      state.signedIn = true;
      return ok;
    },
    async logout() {
      state.signedIn = false;
      return ok;
    },
    async onError(error) {
      return { action: 'propagate', error };
    },
    async getToken() {
      return null;
    },
    async switchOrganization(organizationId) {
      if (state.refusal) return state.refusal;
      state.organizationId = organizationId;
      return ok;
    },
  };
}

function LocationProbe(): React.ReactElement {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function renderAt(path: string, state: FakeState) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ConsoleApp auth={fakeAuth(state)} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

async function pathname(expected: string): Promise<void> {
  await screen.findByText(expected, { selector: '[data-testid="location"]' });
}

describe('console routes', () => {
  it('should send a signed-out visitor to the sign-in page', async () => {
    renderAt('/dashboard', { signedIn: false, organizationId: null, memberships: [] });

    await pathname('/login');
    expect(await screen.findByLabelText(/email/i)).toBeDefined();
  });

  it('should send a signed-in user without an organization to the picker', async () => {
    renderAt('/dashboard', {
      signedIn: true,
      organizationId: null,
      memberships: [member(NOVA, 'Nova Tower Business Center'), member(RIVER, 'Riverside Office Park')],
    });

    await pathname('/organizations');
    expect(await screen.findByRole('button', { name: /Nova Tower Business Center/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /Riverside Office Park/ })).toBeDefined();
  });

  it('should explain, not show an empty shell, when no membership is active', async () => {
    renderAt('/dashboard', {
      signedIn: true,
      organizationId: null,
      memberships: [member(NOVA, 'Nova Tower Business Center', 'suspended')],
    });

    await pathname('/organizations');
    expect(await screen.findByText(/has no active organization membership/)).toBeDefined();
    expect(screen.queryByRole('button', { name: /Nova Tower Business Center/ })).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('should keep the current organization and show the reason when a switch is refused', async () => {
    renderAt('/dashboard', {
      signedIn: true,
      organizationId: NOVA,
      memberships: [member(NOVA, 'Nova Tower Business Center'), member(RIVER, 'Riverside Office Park')],
      refusal: {
        success: false,
        error: { kind: 'forbidden', code: 'membership-inactive', message: 'Your membership in Riverside is suspended.' },
      },
    });

    const switcher = await screen.findByRole('button', { name: 'Organization: Nova Tower Business Center' });
    fireEvent.keyDown(switcher, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Riverside Office Park/ }));

    expect(await screen.findByText('Your membership in Riverside is suspended.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Organization: Nova Tower Business Center' })).toBeDefined();
    expect(screen.getByTestId('location').textContent).toBe('/dashboard');
  });

  it('should offer a retry, not "no organization", when the memberships cannot be loaded', async () => {
    const state: FakeState = {
      signedIn: true,
      organizationId: null,
      memberships: [member(NOVA, 'Nova Tower Business Center'), member(RIVER, 'Riverside Office Park')],
      identityFailures: 100,
    };
    renderAt('/organizations', state);

    const retry = await screen.findByRole('button', { name: 'Retry' }, { timeout: 8_000 });
    expect(screen.getByText(/could not load your organizations/i)).toBeDefined();
    expect(screen.queryByText(/has no active organization membership/)).toBeNull();
    expect(screen.getByTestId('location').textContent).toBe('/organizations');

    state.identityFailures = 0;
    fireEvent.click(retry);
    expect(await screen.findByRole('button', { name: /Nova Tower Business Center/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /Riverside Office Park/ })).toBeDefined();
  });
});
