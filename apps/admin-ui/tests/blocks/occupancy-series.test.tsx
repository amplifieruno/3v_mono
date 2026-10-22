// @vitest-environment jsdom
import { renderBlock } from '@burojs/testing/react';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { occupancySeriesBlock } from '../../src/blocks/occupancy-series/occupancy-series-block';
import { occupancySeriesView } from '../../src/blocks/occupancy-series/views';
import { Wrapper } from '../support/analytics-dom';
import { FACILITY, messagesOf, stubHasura } from '../support/analytics-fake';
import { hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * The occupancy series (`itap:occupancy-series`): the facility's zone is read first and sets the
 * period's day boundaries (Review Focus 5): "last 30 days" in Moscow is 30 Moscow days ending on
 * Moscow's today, from Moscow midnight, although the browser's clock (UTC here) is still on the
 * previous day; the people line and the entries/exits columns are drawn from the answer.
 */

const NOW = new Date('2026-10-22T22:30:00Z'); // 01:30 on 23 October in Moscow
const MESSAGES = messagesOf(occupancySeriesBlock);
let series: unknown[] = [];
let sent: ReturnType<typeof stubHasura>;

beforeAll(installDomShims);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  series = [];
  sent = stubHasura(() => ({
    FacilityZone: { facilities_by_pk: { id: FACILITY, name: 'Nova Tower', timezone: 'Europe/Moscow' } },
    OccupancySeries: { occupancy_series: series },
  }));
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const row = (bucket_start: string, day: string | null, people: number, entries: number, exits: number) => ({
  bucket_start,
  day,
  unique_identities: people,
  entries,
  exits,
  dwell_seconds: people * 600,
  avg_dwell_seconds: 600,
  peak_occupancy: people,
});

describe('the occupancy series block', () => {
  it('should read 30 days from the facility’s midnight to the end of its today (Review Focus 5)', async () => {
    series = [row('2026-10-21T21:00:00+00:00', '2026-10-22', 12, 20, 18), row('2026-10-22T21:00:00+00:00', '2026-10-23', 3, 4, 0)];
    await renderBlock(occupancySeriesView, { props: { facilityId: FACILITY, days: 30 }, wrapper: Wrapper, messages: MESSAGES });
    const section = await screen.findByLabelText('Occupancy over time');
    expect(section.getAttribute('data-bucket')).toBe('day');
    const read = sent().find((request) => request.operation === 'OccupancySeries');
    expect(read?.variables).toEqual({
      facility: FACILITY,
      from: '2026-09-23T21:00:00.000Z', // Moscow midnight starting 24 September
      to: '2026-10-23T21:00:00.000Z', // Moscow midnight ending 23 October, the facility's today
      bucket: 'day',
    });
    expect(screen.getByTestId('occupancy-series:flow').textContent).toContain('24 entries · 18 exits');
    expect(screen.getAllByTestId('occupancy-series:flow-up')).toHaveLength(2);
    expect(screen.getAllByTestId('occupancy-series:flow-down')).toHaveLength(1);
    expect(screen.getByText(/Peak on site: 12 people/)).toBeDefined();
    expect(screen.getByText(/Europe\/Moscow/)).toBeDefined();
  });

  it('should read the last 24 hours by hour up to the next hour boundary', async () => {
    series = [row('2026-10-22T21:00:00+00:00', null, 2, 2, 0)];
    await renderBlock(occupancySeriesView, { props: { facilityId: FACILITY, days: 1 }, wrapper: Wrapper, messages: MESSAGES });
    await screen.findByLabelText('Occupancy over time');
    expect(sent().find((request) => request.operation === 'OccupancySeries')?.variables).toEqual({
      facility: FACILITY,
      from: '2026-10-21T23:00:00.000Z',
      to: '2026-10-22T23:00:00.000Z',
      bucket: 'hour',
    });
  });

  it('should ask for a facility and read nothing without one', async () => {
    await renderBlock(occupancySeriesView, { props: { facilityId: null, days: 7 }, wrapper: Wrapper, messages: MESSAGES });
    expect(await screen.findByText(/Choose a facility in the sidebar/)).toBeDefined();
    expect(sent()).toEqual([]);
  });

  it('should say when nobody was recorded and when the facility cannot be read', async () => {
    series = [row('2026-10-21T21:00:00+00:00', '2026-10-22', 0, 0, 0)];
    await renderBlock(occupancySeriesView, { props: { facilityId: FACILITY, days: 30 }, wrapper: Wrapper, messages: MESSAGES });
    expect(await screen.findByText('Nobody was recorded in this facility over the period.')).toBeDefined();
    cleanup();
    vi.mocked(fetch).mockImplementation(async () => hasuraResponse({ data: { facilities_by_pk: null } }));
    await renderBlock(occupancySeriesView, { props: { facilityId: FACILITY, days: 30 }, wrapper: Wrapper, messages: MESSAGES });
    await waitFor(() => expect(screen.getByText('This facility cannot be read.')).toBeDefined());
  });
});
