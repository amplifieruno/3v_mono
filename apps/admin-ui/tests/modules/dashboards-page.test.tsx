// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * Dashboards over a fake Hasura: the record page draws every widget as a tile and never breaks on
 * one (a query the viewer may not read says "no access", refused settings name the reason, a
 * facility widget without a facility asks for the sidebar's; Review Focus 1); a dashboard shared by
 * someone else offers no Edit (Review Focus 2); the editor names the widget the contract refuses and
 * sends nothing; the landing page shows the member's own landing dashboard.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const BOARD = '33333333-3333-4333-8333-000000000001';
const FACILITY = '22222222-2222-4222-8222-000000000001';

interface GraphqlBody {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
}

const widget = (id: string, kind: string, title: string, query: string, params: Record<string, unknown>, x: number, y: number, w: number, h = 3) => ({
  id,
  kind,
  title,
  query,
  params,
  position: { x, y, w, h },
});

const WIDGETS = [
  widget('kpis', 'kpi', 'Today', 'dashboard_kpis', { figures: ['unique_visitors_today'], details: false }, 0, 0, 12, 2),
  widget('flows', 'flow_matrix', 'Main flows', 'flow_matrix', { facility_id: FACILITY, days: 30 }, 0, 2, 6),
  widget('busy', 'heatmap', 'Busy hours', 'area_hourly_stats', { facility_id: FACILITY, days: 45 }, 6, 2, 6),
  widget('week', 'occupancy_series', 'Occupancy, last 7 days', 'occupancy_series', { days: 7 }, 0, 5, 12),
];

/** The root fields the fake viewer may read: everything the widgets read but `flow_matrix`. */
const READABLE = ['dashboard_kpis', 'area_hourly_stats', 'occupancy_series', 'facility_occupancy_now', 'incidents', 'devices'];

let board: Record<string, unknown>;
let landing: unknown[];

const row = (overrides: Record<string, unknown> = {}) => ({
  id: BOARD,
  name: 'Security overview',
  description: 'Live situation for the security desk',
  is_shared: true,
  is_default: false,
  owner_id: 'user-1',
  owned_by_me: true,
  widgets: WIDGETS,
  created_at: '2026-10-20T08:00:00Z',
  updated_at: '2026-10-21T08:00:00Z',
  ...overrides,
});

const KPIS = {
  as_of: '2026-10-22T10:00:00Z',
  local_date: '2026-10-22',
  unique_visitors_today: 42,
  current_occupancy: 7,
  open_incidents: 0,
  open_incidents_critical: 0,
  open_incidents_high: 0,
  open_incidents_medium: 0,
  open_incidents_low: 0,
  open_incidents_info: 0,
  devices_offline: 0,
  deliveries_failed_24h: 0,
  segment_top_movers: [],
};

const bodies = (): GraphqlBody[] =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).includes('graphql'))
    .map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody);

const mutations = () => bodies().filter((body) => body.query.trimStart().startsWith('mutation'));

async function serve(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query } = JSON.parse(String(init?.body)) as GraphqlBody;
  if (query.includes('ReadableRootFields')) return hasuraResponse({ data: { __type: { fields: READABLE.map((name) => ({ name })) } } });
  if (query.includes('LandingDashboard')) return hasuraResponse({ data: { dashboards: landing } });
  if (query.includes('DashboardKpis')) return hasuraResponse({ data: { dashboard_kpis: [KPIS] } });
  if (query.includes('dashboards_by_pk')) return hasuraResponse({ data: { item: board } });
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 0 } } } });
  if (/\bitems: dashboards\(/.test(query)) return hasuraResponse({ data: { items: [board] } });
  if (/\bitems: facilities\(/.test(query)) {
    return hasuraResponse({ data: { items: [{ id: FACILITY, code: 'FAC-1', name: 'Nova Tower', status: 'active' }] } });
  }
  if (/\bitems: users\(/.test(query)) return hasuraResponse({ data: { items: [{ id: 'user-1', displayName: 'Admin', email: 'admin@itap.demo' }] } });
  return hasuraResponse({ data: { items: [] } });
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ConsoleApp auth={fakeAdminAuth(NOVA, 'Nova Tower Business Center')} />
    </MemoryRouter>,
  );

const tileTitled = (title: string): HTMLElement => {
  const tile = screen.getAllByTestId('dashboard-tile').find((node) => node.getAttribute('aria-label') === title);
  if (tile === undefined) throw new Error(`no tile titled ${title}`);
  return tile;
};

configure({ asyncUtilTimeout: 5000 });

beforeAll(installDomShims);

beforeEach(() => {
  localStorage.clear();
  board = row();
  landing = [];
  vi.stubGlobal('fetch', vi.fn(serve));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('dashboard page', () => {
  it('should draw every widget in its own tile, in reading order, without one breaking the others', async () => {
    renderAt(`/dashboards/${BOARD}`);
    await screen.findByTestId('dashboard-grid');
    const titles = screen.getAllByTestId('dashboard-tile').map((tile) => tile.getAttribute('aria-label'));
    expect(titles).toEqual(['Today', 'Main flows', 'Busy hours', 'Occupancy, last 7 days']);
    // The key figures read and draw.
    expect((await within(tileTitled('Today')).findByTestId('kpi:unique_visitors_today')).textContent).toContain('42');
    // A query the viewer may not read: "no access", not a failed read (Review Focus 1).
    await waitFor(() => expect(within(tileTitled('Main flows')).getByTestId('dashboard-tile:no-access').textContent).toBe(
      'You may not read flow_matrix, so this widget stays empty for you.',
    ));
    expect(bodies().some((body) => body.query.includes('FlowMatrix'))).toBe(false);
    // Settings the block refuses: the reason in the tile.
    const busy = within(tileTitled('Busy hours')).getByTestId('dashboard-tile:invalid');
    expect(busy.textContent).toContain('This widget cannot be shown:');
    expect(busy.textContent).toMatch(/days: /u);
    // A facility widget naming no facility, with none in the sidebar: it asks for one.
    expect(within(tileTitled('Occupancy, last 7 days')).getByTestId('dashboard-tile:choose-facility').textContent).toMatch(/^Choose a facility in the sidebar/u);
  });

  it('should show a facility widget naming none for the sidebar facility', async () => {
    localStorage.setItem(`itap:facility:${NOVA}`, FACILITY);
    board = row({ widgets: [widget('week', 'occupancy_series', 'Occupancy, last 7 days', 'occupancy_series', { days: 7 }, 0, 0, 12)] });
    renderAt(`/dashboards/${BOARD}`);
    await screen.findByTestId('dashboard-tile');
    await waitFor(() => expect(bodies().some((body) => body.query.includes('FacilityZone') && JSON.stringify(body.variables).includes(FACILITY))).toBe(true));
    expect(screen.queryByTestId('dashboard-tile:choose-facility')).toBeNull();
  });

  it('should offer no Edit on a dashboard shared by someone else (Review Focus 2)', async () => {
    board = row({ owner_id: 'user-2', owned_by_me: false });
    renderAt(`/dashboards/${BOARD}`);
    await screen.findByTestId('dashboard-grid');
    const edit = await screen.findByRole('button', { name: /^Edit/ });
    expect(edit.getAttribute('aria-disabled')).toBe('true');
  });

  it('should keep Edit for the owner', async () => {
    renderAt(`/dashboards/${BOARD}`);
    await screen.findByTestId('dashboard-grid');
    const edit = await screen.findByRole('link', { name: /^Edit/ });
    expect(edit.getAttribute('aria-disabled')).not.toBe('true');
  });
});

describe('dashboard list', () => {
  it('should enable Edit and Delete on the rows of the member\'s own dashboards only', async () => {
    board = row({ owner_id: 'user-1', owned_by_me: true });
    renderAt('/dashboards');
    await screen.findByText('Security overview');
    expect(bodies().some((body) => /items: dashboards\(/.test(body.query) && body.query.includes('owned_by_me'))).toBe(true);
    const more = screen.getByRole('button', { name: 'More' });
    fireEvent.keyDown(more, { key: 'Enter' });
    const actions = await screen.findAllByRole('menuitem');
    expect(actions.map((node) => node.textContent)).toEqual(expect.arrayContaining([expect.stringMatching(/^Edit/u), expect.stringMatching(/^Delete/u)]));
    expect(actions.filter((node) => node.getAttribute('aria-disabled') === 'true' || node.hasAttribute('data-disabled'))).toEqual([]);
  });
});

describe('dashboard editor', () => {
  it('should lock the form of a dashboard shared by someone else, with the reason', async () => {
    board = row({ owner_id: 'user-2', owned_by_me: false });
    renderAt(`/dashboards/${BOARD}/edit`);
    expect((await screen.findAllByText(/only the owner can change or delete it/u)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Add widget' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove Today/u })).toBeNull();
  });

  it('should name the widget the contract refuses, preview the widgets and send nothing', async () => {
    board = row({ widgets: [WIDGETS[0]] });
    renderAt(`/dashboards/${BOARD}/edit`);
    const rows = await screen.findAllByTestId('dashboard-widget-row');
    expect(rows).toHaveLength(1);
    // The preview draws the form's widgets.
    expect(await screen.findByText('Preview: the widgets as they will show, read live. Save to keep them.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Add widget' }));
    await waitFor(() => expect(screen.getAllByTestId('dashboard-widget-row')).toHaveLength(2));
    const added = screen.getAllByTestId('dashboard-widget-row')[1] as HTMLElement;
    fireEvent.change(within(added).getByLabelText('Column (0–11)'), { target: { value: '8' } });
    expect(await within(added).findByText('Widget 2 “New widget”: x + w must be at most 12 (it is 8 + 12).')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(mutations()).toHaveLength(0);

    fireEvent.change(within(added).getByLabelText('Width (columns)'), { target: { value: '4' } });
    await waitFor(() => expect(within(added).queryByTestId('dashboard-widget-problems')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    expect(mutations()[0]?.query).toContain('update_dashboards_by_pk');
    expect(JSON.stringify(mutations()[0]?.variables)).toContain('"position":{"h":3,"w":4,"x":8,"y":2}');
  });
});

describe('new dashboard', () => {
  it('should create a dashboard with a widget, its owner stamped by the server', async () => {
    renderAt('/dashboards/create');
    fireEvent.change(await screen.findByRole('textbox', { name: /^Name/u }), { target: { value: 'Night desk' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Add widget' }));
    await waitFor(() => expect(screen.getAllByTestId('dashboard-widget-row')).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: /Create|Save/u }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    expect(mutations()[0]?.query).toContain('insert_dashboards_one');
    const sent = JSON.stringify(mutations()[0]?.variables);
    expect(sent).toContain('"name":"Night desk"');
    expect(sent).toContain('"query":"dashboard_kpis"');
    expect(sent).not.toContain('owner_id');
    expect(sent).not.toContain('owned_by_me');
  });
});

describe('landing page', () => {
  it('should show the member’s landing dashboard above the key figures', async () => {
    landing = [{ id: BOARD, name: 'Security overview', widgets: [WIDGETS[0]] }];
    renderAt('/dashboard');
    expect(await screen.findByText('My dashboard')).toBeDefined();
    expect(await screen.findByTestId('dashboard-tile')).toBeDefined();
  });

  it('should show only the key figures without a landing dashboard', async () => {
    renderAt('/dashboard');
    await waitFor(() => expect(bodies().some((body) => body.query.includes('LandingDashboard'))).toBe(true));
    await waitFor(() => expect(bodies().some((body) => body.query.includes('DashboardKpis'))).toBe(true));
    expect(screen.queryByText('My dashboard')).toBeNull();
    expect(screen.queryByTestId('dashboard-tile')).toBeNull();
  });
});
