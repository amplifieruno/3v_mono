// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * The work schedule edit form with the time window field: an overnight window shows
 * as one window and saves unchanged; a window with equal ends or no days is refused on
 * the field before any request.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const SCHEDULE = '22222222-2222-4222-8222-222222222222';

const WINDOWS = [{ days: [1, 2, 3, 4, 5, 6, 7], from: '22:00', to: '06:00' }];

const ROW = {
  id: SCHEDULE,
  name: 'Night Shift',
  timezone: 'Europe/Moscow',
  windows: WINDOWS,
  description: 'Daily 22:00–06:00',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
};

interface GraphqlBody {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
}

const bodies = (): GraphqlBody[] =>
  vi.mocked(fetch).mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody);

const mutations = (): GraphqlBody[] =>
  bodies().filter((body) => body.query.trimStart().startsWith('mutation'));

/** The Hasura endpoint serving `row` as the only work schedule. */
const graphqlServing =
  (row: typeof ROW | (Omit<typeof ROW, 'windows'> & { windows: unknown })) =>
  async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const { query } = JSON.parse(String(init?.body)) as GraphqlBody;
    if (query.trimStart().startsWith('mutation')) return hasuraResponse({ data: { item: row } });
    const data = query.includes('work_schedules_by_pk')
      ? { item: row }
      : query.includes('_aggregate')
        ? { meta: { aggregate: { count: query.includes('work_schedules_aggregate') ? 1 : 0 } } }
        : { items: query.includes('work_schedules(') ? [row] : [] };
    return hasuraResponse({ data });
  };

const fakeGraphql = graphqlServing(ROW);

beforeAll(installDomShims);

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(fakeGraphql));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('work schedule list', () => {
  it('should show the windows as text and the zone with its offset', async () => {
    render(
      <MemoryRouter initialEntries={['/work-schedules']}>
        <ConsoleApp auth={fakeAdminAuth(NOVA, 'Nova Tower Business Center')} />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Daily 22:00–06:00 (overnight)')).toBeDefined();
    expect(screen.getByText(/Europe\/Moscow/).textContent).toBe('Europe/Moscow (UTC+03:00)');
  });

  it('should say what no windows means for a schedule: never on shift', async () => {
    vi.stubGlobal('fetch', vi.fn(graphqlServing({ ...ROW, windows: [] })));
    render(
      <MemoryRouter initialEntries={['/work-schedules']}>
        <ConsoleApp auth={fakeAdminAuth(NOVA, 'Nova Tower Business Center')} />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Never on shift')).toBeDefined();
    expect(screen.queryByText('No windows')).toBeNull();
  });
});

describe('work schedule form', () => {
  it('should refuse an invalid window before any request and save an overnight window unchanged', async () => {
    render(
      <MemoryRouter initialEntries={[`/work-schedules/${SCHEDULE}/edit`]}>
        <ConsoleApp auth={fakeAdminAuth(NOVA, 'Nova Tower Business Center')} />
      </MemoryRouter>,
    );

    const to = await screen.findByRole('textbox', { name: /^To \(Window 1\)/ });
    expect((to as HTMLInputElement).value).toBe('06:00');
    expect(screen.getByText('Ends the next day')).toBeDefined();
    expect(screen.getByText(/Europe\/Moscow/)).toBeDefined();

    fireEvent.change(to, { target: { value: '22:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    expect(await screen.findByText(/Window 1: start and end are the same/)).toBeDefined();
    expect(mutations()).toHaveLength(0);

    fireEvent.change(to, { target: { value: '06:00' } });
    const days = screen.getByRole('group', { name: 'Days of window 1' });
    for (const day of Array.from(days.querySelectorAll('button'))) fireEvent.click(day);
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    expect(await screen.findByText(/Window 1: pick at least one day/)).toBeDefined();
    expect(mutations()).toHaveLength(0);

    for (const day of Array.from(days.querySelectorAll('button'))) fireEvent.click(day);
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    expect((mutations()[0]?.variables?.set as { windows?: unknown }).windows).toEqual(WINDOWS);
  });
});
