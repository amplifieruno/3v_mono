// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * Compliance on screen: a started hold's edit form shows its start without an input (Review
 * Focus 3) while a future hold's start is an input; a held profile says so at the top with a link
 * to the hold, an unheld one does not; the retention plan shows counts per class and sends no
 * mutation (Review Focus 2).
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const HOLD = '33333333-3333-4333-8333-000000000031';
const PROFILE = '44444444-4444-4444-8444-000000000041';
const POLICY = '55555555-5555-4555-8555-000000000051';
const FACILITY = '22222222-2222-4222-8222-000000000021';
const HOUR = 3_600_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

let holdRow: Record<string, unknown> = {};
let covering: unknown[] = [];

interface GraphqlBody {
  readonly query: string;
}

const graphqlBodies = () =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).includes('graphql'))
    .map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody);

const PLAN = [
  { data_class: 'detections', facility_id: FACILITY, policy_id: POLICY, action: 'delete', retain_days: 45, cutoff: iso(-45 * 24 * HOUR), candidates: 12, held: 3 },
  { data_class: 'audit', facility_id: null, policy_id: POLICY, action: 'delete', retain_days: 730, cutoff: iso(-730 * 24 * HOUR), candidates: 0, held: 0 },
  { data_class: 'embeddings_withdrawn', facility_id: null, policy_id: null, action: 'delete', retain_days: 30, cutoff: iso(-30 * 24 * HOUR), candidates: 2, held: 0 },
];

async function serve(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query } = JSON.parse(String(init?.body)) as GraphqlBody;
  if (query.includes('RetentionPlan')) return hasuraResponse({ data: { retention_plan: PLAN, facilities: [{ id: FACILITY, name: 'Nova Tower' }] } });
  if (query.includes('LegalHoldsCovering')) return hasuraResponse({ data: { legal_hold_targets: covering } });
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 0 } } } });
  if (query.includes('legal_holds_by_pk')) return hasuraResponse({ data: { item: holdRow } });
  if (query.includes('profiles_by_pk')) {
    return hasuraResponse({ data: { item: { id: PROFILE, first_name: 'Ada', last_name: 'Held', full_name: 'Ada Held', profile_type: 'employee', status: 'active' } } });
  }
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
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => undefined;
});

beforeEach(() => {
  holdRow = { id: HOLD, name: 'Litigation Smith', reason: 'Claim 42', starts_at: iso(-24 * HOUR), ends_at: null, created_by: null, created_at: iso(-24 * HOUR) };
  covering = [];
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(serve));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('editing a legal hold (Review Focus 3)', () => {
  it('should show a started hold’s start without an input, and offer its end', async () => {
    renderAt(`/legal-holds/${HOLD}/edit`);
    await screen.findByDisplayValue('Litigation Smith');
    expect(screen.queryByLabelText(/^Starts/)).toBeNull();
    expect(await screen.findByText(/its start can no longer move/)).toBeDefined();
    expect(screen.getByLabelText(/^Ends/)).toBeDefined();
  });

  it('should offer the start of a hold that has not started', async () => {
    holdRow = { ...holdRow, starts_at: iso(48 * HOUR) };
    renderAt(`/legal-holds/${HOLD}/edit`);
    await screen.findByDisplayValue('Litigation Smith');
    expect(screen.getByLabelText(/^Starts/)).toBeDefined();
  });
});

describe('the hold notice', () => {
  it('should head a held profile with a link to the hold', async () => {
    covering = [
      { profile_id: PROFILE, identity_id: null, incident_id: null, facility_id: null, hold: { id: HOLD, name: 'Litigation Smith', starts_at: iso(-24 * HOUR), ends_at: null } },
    ];
    renderAt(`/profiles/${PROFILE}`);
    const notice = await screen.findByTestId('legal-hold-notice');
    expect(notice.textContent).toContain('Under legal hold');
    expect(notice.textContent).toContain('until further notice');
    expect(within(notice).getByRole('link', { name: 'Litigation Smith' })).toBeDefined();
    const read = graphqlBodies().find((body) => body.query.includes('LegalHoldsCovering'));
    expect(read).toBeDefined();
  });

  it('should say nothing on a profile no hold covers', async () => {
    renderAt(`/profiles/${PROFILE}`);
    await screen.findAllByText('Ada Held');
    await vi.waitFor(() => expect(graphqlBodies().some((body) => body.query.includes('LegalHoldsCovering'))).toBe(true));
    expect(screen.queryByTestId('legal-hold-notice')).toBeNull();
  });
});

describe('the retention plan (Review Focus 2)', () => {
  it('should count per class and change nothing', async () => {
    renderAt('/retention-plan');
    const summary = await screen.findByTestId('retention-plan-summary');
    expect(summary.textContent).toBe('14 rows would be purged; 3 rows past their retention are kept by legal holds.');
    const rows = await screen.findAllByTestId('retention-plan-row');
    expect(rows.map((row) => row.getAttribute('data-class'))).toEqual(['detections', 'audit', 'embeddings_withdrawn']);
    expect(within(rows[0]!).getByRole('link', { name: 'Nova Tower' })).toBeDefined();
    expect(within(rows[0]!).getByTestId('retention-plan-candidates').textContent).toBe('12');
    expect(within(rows[2]!).getByText('Consent window (organization settings)')).toBeDefined();
    expect(graphqlBodies().filter((body) => body.query.trimStart().startsWith('mutation'))).toHaveLength(0);
  });
});
