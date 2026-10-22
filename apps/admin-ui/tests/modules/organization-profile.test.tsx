// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';
import { LocationProbe } from '../support/location-probe';

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

beforeAll(installDomShims);

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
  return hasuraResponse({ data });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(fakeGraphql));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('organization profile page', () => {
  it('should show the current organization and open its edit screen', async () => {
    render(
      <MemoryRouter initialEntries={['/organization-profile']}>
        <ConsoleApp auth={fakeAdminAuth(NOVA, ROW.name)} />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Nova Tower LLC')).toBeDefined();
    expect(screen.getByText('Regional settings')).toBeDefined();
    expect(screen.getByText('Europe/Moscow')).toBeDefined();
    // The current-record frame (`src/app/current-record-frame*`): the page's own heading, no record
    // title or copyable id under it (`tasks/ui/buro-gaps.md` G16).
    expect(screen.getByRole('heading', { level: 1, name: 'Organization' })).toBeDefined();
    expect(screen.queryByRole('heading', { level: 2, name: ROW.name })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy ID' })).toBeNull();
    // Every read carried the token of the `auth` prop, the console's one token source.
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const [, init] of calls) {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer fake-org-token');
    }

    fireEvent.click(screen.getByRole('link', { name: /Edit/ }));
    expect(await screen.findByText(`/organization/${NOVA}/edit`, { selector: '[data-testid="location"]' })).toBeDefined();
    expect(await screen.findByRole('button', { name: /Upload/ })).toBeDefined();
  });
});
