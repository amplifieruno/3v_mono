// @vitest-environment jsdom
import { renderBlock } from '@burojs/testing/react';
import { cleanup, screen } from '@testing-library/react';
import type * as React from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRuntime } from '../../src/app/runtime';
import { segmentStatsBlock } from '../../src/blocks/segment-stats/segment-stats-block';
import { isoDay } from '../../src/blocks/segment-stats/segment-stats-series';
import { segmentStatsView } from '../../src/blocks/segment-stats/views';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * The segment trend (`itap:segment-stats`): the member count per day and the people added and
 * removed per day over the last 30 days, read from `segment_daily_stats` for the segment from the
 * window's first day; with no figures it says so.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const SEGMENT = '22222222-2222-4222-8222-222222222222';

const daysAgo = (n: number) => {
  const now = new Date();
  return isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n));
};

let rows: unknown[] = [];
const bodies = (): string[] => vi.mocked(fetch).mock.calls.map(([, init]) => String(init?.body ?? ''));

function Wrapper({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  return (
    <MemoryRouter>
      <AppRuntime auth={fakeAdminAuth(ORG, 'Nova')} initialOrganizationId={ORG}>
        {children}
      </AppRuntime>
    </MemoryRouter>
  );
}

const MESSAGES = Object.fromEntries(
  Object.entries(segmentStatsBlock.texts as Record<string, unknown>).filter(([, value]) => typeof value === 'string'),
) as Record<string, string>;

beforeAll(installDomShims);

beforeEach(() => {
  rows = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      String(init?.body ?? '').includes('segment_daily_stats')
        ? hasuraResponse({ data: { segment_daily_stats: rows } })
        : hasuraResponse({ data: {} }),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the segment trend block', () => {
  it('should chart the members and the churn of the last 30 days', async () => {
    rows = [
      { day: daysAgo(3), member_count: 5, added: 5, removed: 0 },
      { day: daysAgo(2), member_count: 6, added: 2, removed: 1 },
      { day: daysAgo(0), member_count: 4, added: 0, removed: 2 },
    ];
    await renderBlock(segmentStatsView, { props: { segmentId: SEGMENT }, wrapper: Wrapper, messages: MESSAGES });
    const members = await screen.findByTestId('segment-stats:members');
    expect(members.textContent).toContain('now 4');
    expect(members.textContent).toContain('min 4 · max 6');
    expect(screen.getByRole('img', { name: 'Members per day over the last 30 days' })).toBeDefined();
    const churn = screen.getByTestId('segment-stats:churn');
    expect(churn.textContent).toContain('+7 added · −3 removed');
    expect(screen.getAllByTestId('segment-stats-added')).toHaveLength(2);
    expect(screen.getAllByTestId('segment-stats-removed')).toHaveLength(2);

    const sent = JSON.parse(String(bodies().find((body) => body.includes('segment_daily_stats')))) as {
      variables: { segment: string; since: string };
    };
    expect(sent.variables).toEqual({ segment: SEGMENT, since: daysAgo(29) });
  });

  it('should say when the segment has no figures yet', async () => {
    await renderBlock(segmentStatsView, { props: { segmentId: SEGMENT }, wrapper: Wrapper, messages: MESSAGES });
    expect(await screen.findByText(/No daily figures in the last 30 days yet/)).toBeDefined();
  });

  it('should say when the figures cannot be read', async () => {
    vi.mocked(fetch).mockImplementation(async () => hasuraResponse({ errors: [{ message: 'boom', extensions: { code: 'unexpected' } }] }));
    await renderBlock(segmentStatsView, { props: { segmentId: SEGMENT }, wrapper: Wrapper, messages: MESSAGES });
    expect(await screen.findByText('The daily figures could not be read.')).toBeDefined();
  });
});
