// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * The "My preferences" page: the signed-in user's own `user_settings` row as a form, in the
 * current-record frame (`src/app/current-record-frame*`): the page's heading, no record title
 * built from the values and no copyable id (`tasks/ui/buro-gaps.md` G16).
 */

const NOVA = '11111111-1111-4111-8111-111111111111';

/** The row of `fakeAdminAuth`'s user (`user-1`). */
const ROW = {
  user_id: 'user-1',
  locale: 'de',
  timezone: 'Europe/Berlin',
  last_organization_id: NOVA,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
};

async function fakeGraphql(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query } = JSON.parse(String(init?.body)) as { query: string };
  const data = query.includes('user_settings_by_pk')
    ? { item: ROW }
    : query.includes('_aggregate')
      ? { meta: { aggregate: { count: query.includes('user_settings') ? 1 : 0 } } }
      : { items: query.includes('user_settings') ? [ROW] : [] };
  return hasuraResponse({ data });
}

beforeAll(installDomShims);

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(fakeGraphql));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('preferences page', () => {
  it('should edit the own row under the page heading, without a record title', async () => {
    render(
      <MemoryRouter initialEntries={['/preferences']}>
        <ConsoleApp auth={fakeAdminAuth(NOVA, 'Nova Tower Business Center')} />
      </MemoryRouter>,
    );

    expect(await screen.findByDisplayValue('de')).toBeDefined();
    expect(await screen.findByRole('button', { name: /Save/ })).toBeDefined();
    expect(screen.getByRole('heading', { level: 1, name: 'My preferences' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: /de · Europe\/Berlin|^de$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy ID' })).toBeNull();
  });
});
