// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { facilityStorageKey } from '../../src/app/scope';
import { checkFromArea } from '../../src/modules/places/access-point';
import { issueText } from '../support/field-issues';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * Access point screens: the list follows the sidebar facility picker, the form creates an
 * access point with its defaults and refuses leading from the area it leads into, the
 * Devices tab lists the bound devices by id with "+ Create", and the facility page lists its
 * access points and applies a template, warning about names that already exist there.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const TOWER_F = '55555555-5555-4555-8555-555555555555';
const DEPOT_F = '66666666-6666-4666-8666-666666666666';
const LOBBY = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const FLOOR = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002';
const POINT = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001';
const DEVICE = 'cccccccc-cccc-4ccc-8ccc-000000000001';
const TEMPLATE = '77777777-7777-4777-8777-777777777777';

const POINTS = [
  { id: POINT, facility_id: TOWER_F, name: 'Main entrance', kind: 'turnstile', area_id: LOBBY },
  { id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002', facility_id: DEPOT_F, name: 'Dock gate', kind: 'gate', area_id: null },
].map((row) => ({
  from_area_id: null,
  direction: 'both',
  position: null,
  is_entry_exit: true,
  face_credential: false,
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...row,
}));

const BINDING = {
  id: 'dddddddd-dddd-4ddd-8ddd-000000000001',
  facility_id: TOWER_F,
  access_point_id: POINT,
  device_id: DEVICE,
  role: 'terminal',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const FACILITY = {
  id: TOWER_F,
  code: 'FACILITY-00001',
  name: 'Nova Tower',
  status: 'active',
  timezone: 'UTC',
  operating_hours: [],
  contact: {},
  custom_fields: {},
  areas_count: 2,
  current_occupancy: 0,
};

const AREAS = [
  { id: LOBBY, facility_id: TOWER_F, parent_id: null, name: 'Lobby', area_type: 'zone' },
  { id: FLOOR, facility_id: TOWER_F, parent_id: null, name: 'Kitchen', area_type: 'room' },
];

const TEMPLATE_ROW = {
  id: TEMPLATE,
  name: 'Standard office floor',
  description: null,
  structure: [
    { name: 'Lobby', area_type: 'zone', capacity: 30 },
    { name: 'Open Office', area_type: 'zone', children: [{ name: 'Booths', area_type: 'room' }] },
  ],
};

interface GraphqlBody {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
}

const mutations = (): GraphqlBody[] =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).includes('graphql'))
    .map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody)
    .filter((body) => body.query.trimStart().startsWith('mutation'));

async function serve(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query, variables } = JSON.parse(String(init?.body)) as GraphqlBody;
  const text = `${query} ${JSON.stringify(variables ?? {})}`;
  if (query.includes('apply_facility_template')) {
    return hasuraResponse({
      data: {
        apply_facility_template: [
          { id: 'n1', name: 'Lobby', parent_id: null },
          { id: 'n2', name: 'Open Office', parent_id: null },
          { id: 'n3', name: 'Booths', parent_id: 'n2' },
        ],
      },
    });
  }
  if (query.trimStart().startsWith('mutation')) return hasuraResponse({ data: { item: POINTS[0] } });
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 1 } } } });
  if (query.includes('access_points_by_pk')) return hasuraResponse({ data: { item: POINTS[0] } });
  if (query.includes('facilities_by_pk')) return hasuraResponse({ data: { item: FACILITY } });
  if (query.includes('facility_templates_by_pk')) return hasuraResponse({ data: { item: TEMPLATE_ROW } });
  if (query.includes('facility_occupancy_now')) return hasuraResponse({ data: { facility_occupancy_now: [] } });
  if (query.includes('access_point_devices_by_pk')) return hasuraResponse({ data: { item: BINDING } });
  if (/\bitems: access_point_devices\(/.test(query)) return hasuraResponse({ data: { items: [BINDING] } });
  if (/\bitems: access_points\(/.test(query)) {
    const only = [TOWER_F, DEPOT_F].find((f) => text.includes(f));
    return hasuraResponse({ data: { items: POINTS.filter((p) => !only || p.facility_id === only) } });
  }
  if (/\bitems: facility_templates\(/.test(query)) return hasuraResponse({ data: { items: [TEMPLATE_ROW] } });
  if (/\bitems: areas\(/.test(query)) return hasuraResponse({ data: { items: AREAS } });
  if (/\bitems: facilities\(/.test(query)) {
    return hasuraResponse({ data: { items: [FACILITY, { ...FACILITY, id: DEPOT_F, name: 'Depot' }] } });
  }
  return hasuraResponse({ data: { items: [] } });
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ConsoleApp auth={fakeAdminAuth(NOVA, 'Nova Tower Business Center')} />
    </MemoryRouter>,
  );

beforeAll(installDomShims);

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

describe('access point list', () => {
  it('should follow the sidebar facility picker', async () => {
    localStorage.setItem(facilityStorageKey(NOVA), DEPOT_F);
    renderAt('/access-points');
    expect(await screen.findByRole('row', { name: /Dock gate/ })).toBeDefined();
    expect(screen.queryByRole('row', { name: /Main entrance/ })).toBeNull();
  });
});

describe('access point form', () => {
  it('should create an access point with its defaults in the prefilled area', async () => {
    renderAt(`/access-points/create?prefill.facility_id=${TOWER_F}&prefill.area_id=${LOBBY}`);
    fireEvent.change(await screen.findByRole('textbox', { name: /^Name/ }), {
      target: { value: 'Side door' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create|Save/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    expect(mutations()[0]?.variables?.object).toMatchObject({
      facility_id: TOWER_F,
      area_id: LOBBY,
      name: 'Side door',
      kind: 'door',
      direction: 'both',
      is_entry_exit: false,
      face_credential: false,
      status: 'active',
    });
  });

  it('should refuse leading from the area it leads into', async () => {
    const check = (value: unknown, values: Record<string, unknown>) => issueText(checkFromArea(value, { values }));
    expect(check(LOBBY, { area_id: LOBBY })).toBe(
      'Choose another area than the one it leads into, or none.',
    );
    expect(check(FLOOR, { area_id: LOBBY })).toBeNull();
    expect(check(null, { area_id: LOBBY })).toBeNull();
  });
});

describe('access point page', () => {
  it('should list the bound devices by id, offer to bind another and unbind one', async () => {
    renderAt(`/access-points/${POINT}?sections=devices`);
    const cell = await screen.findByText(DEVICE);
    const row = cell.closest('tr') as HTMLElement;
    expect(within(row).getByText('Access terminal')).toBeDefined();

    // "+ Create" binds a device to this access point, in its facility.
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    const device = await screen.findByRole('textbox', { name: /^Device/ });
    fireEvent.change(device, { target: { value: DEVICE } });
    const sheet = device.closest('[role="dialog"]') as HTMLElement;
    fireEvent.click(within(sheet).getByRole('button', { name: /^(Create|Save)/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    expect(mutations()[0]?.variables?.object).toEqual({
      access_point_id: POINT,
      facility_id: TOWER_F,
      device_id: DEVICE,
      role: 'camera',
    });

    // A binding is removed from the row's menu (the built-in Delete, confirmed).
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.scrollIntoView ??= () => undefined;
    fireEvent.keyDown(within(row).getByRole('button', { name: 'More' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Delete/ }));
    const confirm = await screen.findByRole('dialog');
    fireEvent.click(within(confirm).getByRole('button', { name: /Delete/ }));
    await waitFor(() => expect(mutations()).toHaveLength(2));
    expect(mutations()[1]?.query).toContain('delete_access_point_devices');
  });
});

describe('facility page: access points and templates', () => {
  it('should list the facility’s access points', async () => {
    renderAt(`/facilities/${TOWER_F}?sections=access_points`);
    expect(await screen.findByRole('row', { name: /Main entrance/ })).toBeDefined();
  });

  it('should apply a template, warning first about a name already there', async () => {
    renderAt(`/facilities/${TOWER_F}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Apply template' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText('Choose a template to see the areas it creates.'),
    ).toBeDefined();
    // "Inside" offers this facility's areas only: its candidates read the flow's record.
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.scrollIntoView ??= () => undefined;
    const inside = await within(dialog).findByRole('combobox', { name: /^Inside/ });
    fireEvent.click(inside);
    expect(await screen.findByRole('option', { name: /Kitchen/ })).toBeDefined();
    const areaReads = vi
      .mocked(fetch)
      .mock.calls.map(([, init]) => String(init?.body))
      .filter((body) => body.includes('items: areas('));
    expect(areaReads.some((body) => body.includes(TOWER_F))).toBe(true);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    // Choosing the template previews it and names the top-level area already there.
    fireEvent.click(await within(dialog).findByRole('combobox', { name: /^Template/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Standard office floor/ }));
    expect(await within(dialog).findByText('Creates 3 areas:')).toBeDefined();
    expect((await within(dialog).findByRole('alert')).textContent).toContain('Already here: Lobby.');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply template' }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    expect(mutations()[0]?.variables).toEqual({ template: TEMPLATE, facility: TOWER_F, parent: null });
    expect(
      await screen.findByText('Template applied. Areas created: 3, at the top level: 2 (Lobby, Open Office).'),
    ).toBeDefined();
  });
});
