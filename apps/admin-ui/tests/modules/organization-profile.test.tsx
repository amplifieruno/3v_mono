// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type * as React from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import type { ItapAuthProvider, ItapIdentity } from '../../src/auth';
import { authProvider } from '../../src/auth/session';

/**
 * The "Organization" page: the current organization's record screen in show
 * mode, read through the console's Hasura provider (fake `fetch`), with Edit.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';

const ROW = {
  id: NOVA,
  name: 'Nova Tower Business Center',
  slug: 'nova-tower',
  legal_name: 'Nova Tower LLC',
  logo_file_id: null,
  timezone: 'Europe/Moscow',
  locale: 'en',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
};

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

/**
 * The Hasura answers the page needs: the organization by key ({@link ROW}),
 * and empty facility reads for the sidebar's facility picker. The provider
 * aliases its roots (`item`, `items`, `meta`).
 */
async function fakeGraphql(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query } = JSON.parse(String(init?.body)) as { query: string };
  const data = query.includes('organizations_by_pk')
    ? { item: ROW }
    : query.includes('_aggregate')
      ? { meta: { aggregate: { count: 0 } } }
      : { items: [] };
  return new Response(JSON.stringify({ data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(fakeGraphql));
  vi.spyOn(authProvider, 'getToken').mockResolvedValue('org-token');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function fakeAuth(): ItapAuthProvider {
  const identity: ItapIdentity = {
    id: 'user-1',
    email: 'admin@itap.demo',
    name: 'Admin',
    roles: ['org_admin'],
    organizationId: NOVA,
    memberships: [{ organizationId: NOVA, name: ROW.name, logoFileId: null, role: 'admin', status: 'active' }],
  };
  return {
    check: async () => ({ authenticated: true }),
    getIdentity: async () => identity,
    login: async () => ({ success: true }),
    logout: async () => ({ success: true }),
    onError: async (error) => ({ action: 'propagate', error }),
    getToken: async () => 'org-token',
    switchOrganization: async () => ({ success: true }),
  };
}

function LocationProbe(): React.ReactElement {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

describe('organization profile page', () => {
  it('should show the current organization and open its edit screen', async () => {
    render(
      <MemoryRouter initialEntries={['/organization-profile']}>
        <ConsoleApp auth={fakeAuth()} />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Nova Tower LLC')).toBeDefined();
    expect(screen.getByText('Regional settings')).toBeDefined();
    expect(screen.getByText('Europe/Moscow')).toBeDefined();

    fireEvent.click(screen.getByRole('link', { name: /Edit/ }));
    expect(await screen.findByText(`/organization/${NOVA}/edit`, { selector: '[data-testid="location"]' })).toBeDefined();
    expect(await screen.findByRole('button', { name: /Upload/ })).toBeDefined();
  });
});
