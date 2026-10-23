// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * Overrides and terminals on screen: the shell's banner names an active override; an override's
 * Terminals tab says which terminals of its facility have picked up its end (Review Focus 3);
 * "End now" asks for a reason and is not offered once ended; the Terminals page shows each
 * terminal's state and "Publish policy to terminals" answers per terminal, by name.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const FACILITY = '22222222-2222-4222-8222-000000000001';
const OVERRIDE = '33333333-3333-4333-8333-000000000001';
const HOUR = 3_600_000;

const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

let overrideRow: Record<string, unknown> = {};
let bannerReads = 0;

const terminal = (id: string, name: string, extra: Record<string, unknown>) => ({
  device_id: id,
  device_name: name,
  facility_id: FACILITY,
  status: 'active',
  health_status: 'healthy',
  reachable: true,
  synced_epoch: 40,
  synced_at: iso(-60_000),
  sync_error: null,
  epoch: 41,
  urgent_epoch: 41,
  epoch_lag: 1,
  urgent_pending: true,
  seconds_since_urgent: 12,
  bound_seconds: 60,
  within_bound: true,
  ...extra,
});

const TERMINALS = [
  terminal('44444444-4444-4444-8444-000000000001', 'Turnstile 1', { synced_epoch: 41, synced_at: iso(-1_000), urgent_pending: false, epoch_lag: 0 }),
  terminal('44444444-4444-4444-8444-000000000002', 'Turnstile 2', {}),
  terminal('44444444-4444-4444-8444-000000000003', 'Turnstile 4', {
    reachable: false,
    status: 'connection_error',
    sync_error: 'unreachable',
    synced_at: iso(-2 * HOUR),
  }),
];

interface GraphqlBody {
  readonly query: string;
}

const mutations = () =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).includes('graphql'))
    .map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody)
    .filter((body) => body.query.trimStart().startsWith('mutation'));

async function serve(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query } = JSON.parse(String(init?.body)) as GraphqlBody;
  if (query.includes('TerminalSyncStatus')) return hasuraResponse({ data: { terminal_sync_status: TERMINALS } });
  if (query.includes('PublishPolicyToTerminals')) {
    return hasuraResponse({
      data: {
        publish_policy_to_terminals: [
          { device_id: TERMINALS[0]!.device_id, result: 'synced', epoch: 41 },
          { device_id: TERMINALS[2]!.device_id, result: 'unreachable', epoch: 41 },
        ],
      },
    });
  }
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 1 } } } });
  if (query.includes('emergency_overrides_by_pk')) return hasuraResponse({ data: { item: overrideRow } });
  // The banner's read of active overrides (and the overrides list).
  if (query.includes("emergency_overrides(")) {
    // The banner reads the facility's name through the `facility` relationship (providerOptions hint).
    const rows = overrideRow.ended_at === null ? [{ ...overrideRow, buro_rel_0: { name: 'Nova Tower' } }] : [];
    if (query.includes('buro_rel_0: facility { name }')) bannerReads += 1;
    return hasuraResponse({ data: { items: rows } });
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
  overrideRow = {
    id: OVERRIDE,
    facility_id: FACILITY,
    mode: 'lock_all',
    justification: 'Intruder reported in the lobby',
    started_by: null,
    started_at: iso(-HOUR),
    ends_at: iso(HOUR),
    ended_at: null,
    ended_by: null,
    end_reason: null,
  };
  bannerReads = 0;
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(serve));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('an active override', () => {
  it('should head every page with a banner linking to it, and offer End now with a reason', async () => {
    renderAt(`/emergency-overrides/${OVERRIDE}`);
    const banner = await screen.findByTestId('override-banner');
    expect(banner.textContent, banner.textContent ?? '').toMatch(/Emergency override active: Lock all at Nova Tower, until/);
    expect(within(banner).getByRole('link', { name: 'Open the override' })).toBeDefined();
    expect(bannerReads).toBeGreaterThan(0);
    fireEvent.click(await screen.findByRole('button', { name: /^End now/ }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('textbox')).toBeDefined();
    expect(mutations()).toHaveLength(0);
  });

  it('should show which terminals of the facility picked up the override', async () => {
    renderAt(`/emergency-overrides/${OVERRIDE}?sections=terminals`);
    const block = await screen.findByTestId('terminal-sync');
    const rows = await within(block).findAllByTestId('terminal-sync-row');
    expect(rows.map((row) => row.getAttribute('data-state'))).toEqual(['received', 'received', 'unreachable']);
    expect(within(block).getByTestId('terminal-sync-summary').textContent).toContain('2 of 3 terminals of the facility have received this override.');
  });
});

describe('an override ended early (Review Focus 3)', () => {
  it('should show each terminal picking up the end, and offer End now no more', async () => {
    overrideRow = { ...overrideRow, ended_at: iso(-30_000), end_reason: 'All clear' };
    renderAt(`/emergency-overrides/${OVERRIDE}?sections=terminals`);
    const block = await screen.findByTestId('terminal-sync');
    const rows = await within(block).findAllByTestId('terminal-sync-row');
    expect(rows.map((row) => row.getAttribute('data-state'))).toEqual(['received', 'waiting', 'unreachable']);
    expect(within(block).getByTestId('terminal-sync-summary').textContent).toContain(
      '1 of 3 terminals of the facility have received the end of this override.',
    );
    expect(within(block).getByText(/1 unreachable/)).toBeDefined();
    expect(within(rows[2]!).getByText('Unreachable')).toBeDefined();
    expect(screen.queryByTestId('override-banner')).toBeNull();
    expect(screen.queryByRole('button', { name: /^End now/ })).toBeNull();
  });
});

describe('the Terminals page', () => {
  it('should show each terminal’s state and publish with a result per terminal, by name', async () => {
    renderAt('/access-terminals');
    const block = await screen.findByTestId('terminal-sync');
    const rows = await within(block).findAllByTestId('terminal-sync-row');
    expect(rows.map((row) => row.getAttribute('data-state'))).toEqual(['current', 'behind', 'unreachable']);
    expect(within(rows[1]!).getByText(/Urgent change pending for 12 s/)).toBeDefined();
    expect((await screen.findByTestId('publish-intro')).textContent).toMatch(/every access terminal of every facility \(none is selected in the sidebar\), whatever/);
    fireEvent.click(await screen.findByRole('button', { name: /Publish policy to terminals/ }));
    const rowsOut = await screen.findAllByTestId('publish-row', {}, { timeout: 3000 });
    expect(rowsOut).toHaveLength(2);
    const result = rowsOut[0]!.closest('[data-testid="publish-result"]') as HTMLElement;
    expect(within(result).getByTestId('publish-summary').textContent).toBe('Published epoch 41: 1 of 2 terminals synced.');
    expect(await within(result).findByRole('link', { name: 'Turnstile 1' })).toBeDefined();
    expect(within(result).getByText('Unreachable')).toBeDefined();
    expect(mutations()).toHaveLength(1);
  });
});
