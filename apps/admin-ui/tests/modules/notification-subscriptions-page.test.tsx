// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import type { ReportRow } from '../../src/blocks/delivery-report/delivery-report-query';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * My subscriptions and the delivery report on screen: a subscription without any filter is
 * refused on the form before anything is sent, one with a filter is created without naming its
 * subscriber (the database sets it); the delivery report shows the period's figures and its
 * channels, and another period tab reads that period.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const SUBSCRIPTION = '88888888-8888-4888-8888-000000000001';

interface GraphqlBody {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
}

const bodies = (): GraphqlBody[] =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).includes('graphql'))
    .map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody);

const mutations = (): GraphqlBody[] => bodies().filter((body) => body.query.trimStart().startsWith('mutation'));
const reports = (): GraphqlBody[] => bodies().filter((body) => body.query.includes('delivery_report('));

const zero = { pending: 0, sent: 0, delivered: 0, failed: 0, dead_letter: 0, digested: 0, acknowledged: 0, escalations: 0 };
const ROWS: ReportRow[] = [
  { ...zero, channel: 'email', total: 12, sent: 9, dead_letter: 3, ack_rate: null, avg_response_seconds: null },
  { ...zero, channel: 'in_app', total: 40, delivered: 40, acknowledged: 30, ack_rate: 0.75, avg_response_seconds: 90 },
];

const SUBSCRIPTION_ROW = {
  id: SUBSCRIPTION,
  event_type: 'blacklist_match',
  facility_id: null,
  profile_id: null,
  identity_id: null,
  watch_list_id: null,
  channel: 'email',
  min_severity: 'info',
  is_active: true,
  user_id: '66666666-6666-4666-8666-000000000001',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};

async function serve(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query } = JSON.parse(String(init?.body)) as GraphqlBody;
  if (query.trimStart().startsWith('mutation')) return hasuraResponse({ data: { item: SUBSCRIPTION_ROW } });
  if (query.includes('delivery_report(')) return hasuraResponse({ data: { delivery_report: ROWS } });
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 0 } } } });
  if (query.includes('notification_subscriptions_by_pk')) return hasuraResponse({ data: { item: SUBSCRIPTION_ROW } });
  return hasuraResponse({ data: { items: [] } });
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ConsoleApp auth={fakeAdminAuth(NOVA, 'Nova Tower Business Center')} />
    </MemoryRouter>,
  );

beforeAll(() => {
  installDomShims();
  Element.prototype.scrollIntoView ??= () => undefined;
});

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(serve));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('subscription form', () => {
  it('should refuse a subscription that follows nothing, sending nothing', async () => {
    renderAt('/my-subscriptions/create');
    const save = await screen.findByRole('button', { name: /^(Create|Save)/ });
    fireEvent.click(save);
    expect(await screen.findByText(/Choose at least one of event type, facility, person, identity or watch list/)).toBeDefined();
    expect(mutations()).toHaveLength(0);
  });

  it('should offer no webhook channel (G52: the picker reads a subset enum)', async () => {
    renderAt(`/my-subscriptions/${SUBSCRIPTION}/edit`);
    const channel = await screen.findByRole('combobox', { name: /^Channel/ });
    fireEvent.click(channel);
    const options = (await screen.findAllByRole('option')).map((option) => option.textContent ?? '');
    // Each option reads its label, then its description.
    expect(options).toHaveLength(4);
    for (const label of ['In-app', 'Email', 'SMS', 'Push']) expect(options.some((text) => text.startsWith(label)), label).toBe(true);
    expect(options.some((text) => text.startsWith('Webhook'))).toBe(false);
  });
});

describe('delivery report page', () => {
  it('should show the figures and the channels of the last 7 days, and read another period on its tab', async () => {
    renderAt('/delivery-report');
    const table = await screen.findByTestId('delivery-report-table');
    expect(within(table).getAllByTestId('delivery-report-row').map((row) => row.getAttribute('data-channel'))).toEqual(['email', 'in_app']);
    // The facts block: headline figures over every channel.
    const figures = await screen.findByText('52');
    expect(figures).toBeDefined();
    expect(screen.getByText('Dead letters', { selector: ':not(th)' })).toBeDefined();
    expect(screen.getAllByText('75%').length).toBeGreaterThan(0);
    await waitFor(() => expect(reports().length).toBeGreaterThan(0));
    const span = (body: GraphqlBody | undefined) => {
      const { from, to } = (body?.variables ?? {}) as { from: string; to: string };
      return Date.parse(to) - Date.parse(from);
    };
    expect(reports().every((body) => span(body) === 7 * 24 * 3_600_000)).toBe(true);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Last 24 hours' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Last 24 hours' }));
    await waitFor(() => expect(reports().some((body) => span(body) === 24 * 3_600_000)).toBe(true));
  });
});
