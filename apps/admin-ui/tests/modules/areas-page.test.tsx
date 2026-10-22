// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { facilityStorageKey } from '../../src/app/scope';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * The area screens: the sidebar facility picker narrows the Areas list to one facility
 * and "All facilities" lifts it (Review Focus 1); the facility page's Areas tab draws
 * that facility's tree whatever the picker holds, with collapsible branches, occupancy
 * against capacity and links; the area form warns when the chosen parent lies inside
 * the area (Review Focus 2, the database refusal itself is the dev-stack test).
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const TOWER_F = '55555555-5555-4555-8555-555555555555';
const DEPOT_F = '66666666-6666-4666-8666-666666666666';
const id = (n: number): string => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
const [TOWER, FLOOR, ROOM, LOBBY, DOCK] = [id(1), id(2), id(3), id(4), id(5)];

const FACILITIES = [
  { id: TOWER_F, name: 'Nova Tower' },
  { id: DEPOT_F, name: 'Depot' },
].map((row) => ({
  ...row,
  code: 'FACILITY-00001',
  status: 'active',
  description: null,
  address: null,
  latitude: null,
  longitude: null,
  timezone: 'UTC',
  operating_hours: [],
  contact: {},
  custom_fields: {},
  areas_count: 0,
  current_occupancy: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}));

const area = (
  areaId: string,
  facility: string,
  path: readonly string[],
  name: string,
  more: Record<string, unknown> = {},
) => ({
  id: areaId,
  facility_id: facility,
  parent_id: path.length > 1 ? path[path.length - 2] : null,
  name,
  area_type: 'zone',
  access_level: 'public',
  status: 'active',
  description: null,
  capacity: null,
  loitering_threshold_seconds: null,
  path: [...path],
  depth: path.length - 1,
  current_occupancy: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...more,
});

const AREAS = [
  area(TOWER, TOWER_F, [TOWER], 'Tower', { area_type: 'building', capacity: 500, current_occupancy: 7 }),
  area(FLOOR, TOWER_F, [TOWER, FLOOR], 'Floor 2', { area_type: 'floor' }),
  area(ROOM, TOWER_F, [TOWER, FLOOR, ROOM], 'Server room', {
    area_type: 'room',
    access_level: 'secure',
    capacity: 2,
    current_occupancy: 3,
  }),
  area(LOBBY, TOWER_F, [TOWER, LOBBY], 'Lobby'),
  area(DOCK, DEPOT_F, [DOCK], 'Loading dock'),
];

interface GraphqlBody {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
}

const bodies = (): GraphqlBody[] =>
  vi.mocked(fetch).mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody);

/** The area list reads (not counts, not a single row), as sent. */
const areaLists = (): GraphqlBody[] => bodies().filter((b) => /\bitems: areas\(/.test(b.query));

/** Hasura serving the two facilities and the areas, narrowed as the query's `facility_id` asks. */
async function serve(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query, variables } = JSON.parse(String(init?.body)) as GraphqlBody;
  const text = `${query} ${JSON.stringify(variables ?? {})}`;
  if (query.trimStart().startsWith('mutation')) return hasuraResponse({ data: { item: AREAS[1] } });
  if (query.includes('areas_by_pk')) {
    return hasuraResponse({ data: { item: AREAS.find((a) => a.id === variables?.id) ?? null } });
  }
  if (query.includes('facilities_by_pk')) {
    return hasuraResponse({ data: { item: FACILITIES.find((f) => f.id === variables?.id) ?? null } });
  }
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 4 } } } });
  if (query.includes('facility_occupancy_now')) return hasuraResponse({ data: { facility_occupancy_now: [] } });
  if (/\bitems: areas\(/.test(query)) {
    const only = FACILITIES.find((f) => text.includes(f.id))?.id;
    return hasuraResponse({ data: { items: AREAS.filter((a) => only === undefined || a.facility_id === only) } });
  }
  if (/\bitems: facilities\(/.test(query)) return hasuraResponse({ data: { items: FACILITIES } });
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

describe('areas list and the facility picker', () => {
  it('should list every facility’s areas with All facilities', async () => {
    renderAt('/areas');
    expect(await screen.findByRole('row', { name: /Loading dock/ })).toBeDefined();
    expect(screen.getByRole('row', { name: /Server room/ })).toBeDefined();
    for (const body of areaLists()) expect(JSON.stringify(body)).not.toContain(TOWER_F);
  });

  it('should narrow the areas to the selected facility', async () => {
    localStorage.setItem(facilityStorageKey(NOVA), DEPOT_F);
    renderAt('/areas');
    expect(await screen.findByRole('row', { name: /Loading dock/ })).toBeDefined();
    expect(screen.queryByRole('row', { name: /Server room/ })).toBeNull();
    const list = areaLists().at(-1);
    expect(JSON.stringify(list)).toContain(DEPOT_F);
  });
});

describe('switching the facility picker', () => {
  it('should narrow the open list on a pick and widen it again with All facilities', async () => {
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.scrollIntoView ??= () => undefined;
    renderAt('/areas');
    expect(await screen.findByRole('row', { name: /Server room/ })).toBeDefined();
    const picker = () => screen.getByTestId(/context-picker.*facility|facility.*picker/i);
    await waitFor(() => expect(picker()).toBeDefined());

    fireEvent.keyDown(picker(), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: 'Depot' }));
    await waitFor(() => expect(screen.queryByRole('row', { name: /Server room/ })).toBeNull());
    expect(await screen.findByRole('row', { name: /Loading dock/ })).toBeDefined();
    expect(localStorage.getItem(facilityStorageKey(NOVA))).toBe(DEPOT_F);

    fireEvent.keyDown(picker(), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: 'All facilities' }));
    expect(await screen.findByRole('row', { name: /Server room/ })).toBeDefined();
    expect(localStorage.getItem(facilityStorageKey(NOVA))).toBeNull();
  });
});

describe('the facility area tree', () => {
  it('should draw the facility’s own tree even with another facility picked', async () => {
    localStorage.setItem(facilityStorageKey(NOVA), DEPOT_F);
    renderAt(`/facilities/${TOWER_F}?sections=areas`);
    const tree = await screen.findByTestId('area-tree');
    const row = (areaId: string) => within(tree).getByTestId(`area-tree-row:${areaId}`);
    await within(tree).findByText('Server room');
    expect(within(tree).queryByText('Loading dock')).toBeNull();
    // Levels from the parent links; siblings by name.
    expect(row(TOWER).dataset.level).toBe('0');
    expect(row(FLOOR).dataset.level).toBe('1');
    expect(row(ROOM).dataset.level).toBe('2');
    const order = within(tree).getAllByRole('listitem').map((li) => li.dataset.testid);
    expect(order).toEqual([TOWER, FLOOR, ROOM, LOBBY].map((a) => `area-tree-row:${a}`));
    // Occupancy against capacity, over capacity in red; a link to the area and "add inside".
    expect(within(row(ROOM)).getByText('3 / 2').className).toContain('text-destructive');
    expect(within(row(TOWER)).getByText('7 / 500')).toBeDefined();
    expect(within(row(LOBBY)).getByText('0 inside')).toBeDefined();
    expect(within(row(ROOM)).getByRole('link', { name: 'Server room' }).getAttribute('href')).toBe(
      `/areas/${ROOM}`,
    );
    const addInside = within(row(FLOOR)).getByRole('link', { name: 'Add an area inside Floor 2' });
    expect(addInside.getAttribute('href')).toContain(`prefill.parent_id=${FLOOR}`);
    expect(addInside.getAttribute('href')).toContain(`prefill.facility_id=${TOWER_F}`);
    // The tree's read names this facility, not the picked one.
    const treeRead = areaLists().find((b) => JSON.stringify(b).includes(TOWER_F));
    expect(treeRead).toBeDefined();
    expect(JSON.stringify(treeRead)).not.toContain(DEPOT_F);

    fireEvent.click(within(row(FLOOR)).getByRole('button', { name: 'Hide the areas inside Floor 2' }));
    expect(within(tree).queryByText('Server room')).toBeNull();
    fireEvent.click(within(tree).getByRole('button', { name: 'Collapse all' }));
    expect(within(tree).queryByText('Floor 2')).toBeNull();
    fireEvent.click(within(tree).getByRole('button', { name: 'Expand all' }));
    expect(within(tree).getByText('Server room')).toBeDefined();
  });
});

describe('area form: parent inside the area', () => {
  it('should say so when the chosen parent is one of the area’s own sub-areas', async () => {
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.scrollIntoView ??= () => undefined;
    renderAt(`/areas/${FLOOR}/edit`);
    const parent = await screen.findByRole('combobox', { name: /^Inside/ });
    expect(screen.queryByTestId('area-parent-guard')).toBeNull();
    fireEvent.click(parent);
    fireEvent.click(await screen.findByRole('option', { name: /Server room/ }));
    await waitFor(() =>
      expect(screen.getByTestId('area-parent-guard').textContent).toContain(
        '“Server room” is inside this area.',
      ),
    );
    fireEvent.click(screen.getByRole('combobox', { name: /^Inside/ }));
    // Only areas of the area's own facility are offered.
    const offered = (await screen.findAllByRole('option')).map((o) => o.textContent ?? '');
    expect(offered.some((text) => text.includes('Lobby'))).toBe(true);
    expect(offered.some((text) => text.includes('Loading dock'))).toBe(false);
    fireEvent.click(await screen.findByRole('option', { name: /Lobby/ }));
    await waitFor(() => expect(screen.queryByTestId('area-parent-guard')).toBeNull(), { timeout: 3000 });
  });
});

describe('area form: create and edit', () => {
  const mutations = (): GraphqlBody[] =>
    bodies().filter((body) => body.query.trimStart().startsWith('mutation'));

  it('should create an area in the facility and parent the tree linked from', async () => {
    renderAt(`/areas/create?prefill.facility_id=${TOWER_F}&prefill.parent_id=${FLOOR}`);
    const name = await screen.findByRole('textbox', { name: /^Name/ });
    fireEvent.change(name, { target: { value: 'Meeting room' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: /^Capacity/ }), { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: /Create|Save/ }));
    expect(await screen.findByText('Enter a whole number of at least 0.')).toBeDefined();
    expect(mutations()).toHaveLength(0);

    fireEvent.change(screen.getByRole('spinbutton', { name: /^Capacity/ }), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /Create|Save/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    const object = mutations()[0]?.variables?.object as Record<string, unknown>;
    expect(object).toMatchObject({
      facility_id: TOWER_F,
      parent_id: FLOOR,
      name: 'Meeting room',
      area_type: 'zone',
      access_level: 'public',
      status: 'active',
      capacity: 12,
    });
    expect(object).not.toHaveProperty('path');
  });

  it('should never send the facility of an existing area', async () => {
    renderAt(`/areas/${ROOM}/edit`);
    const name = await screen.findByRole('textbox', { name: /^Name/ });
    fireEvent.change(name, { target: { value: 'Server room A' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    const set = mutations()[0]?.variables?.set as Record<string, unknown>;
    expect(set.name).toBe('Server room A');
    expect(set).not.toHaveProperty('facility_id');
  });
});
