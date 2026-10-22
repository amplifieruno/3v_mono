// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * Drawing an area's shape in the area form over the floor plan it lies on (Review Focus 3):
 * a polygon of fewer than 3 points, or a stored point outside the plan image, is refused
 * before any request; three clicks save a closed polygon in plan pixels. An area on no plan
 * says so. The area page shows the plan an area carries and its sub-areas.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const TOWER_F = '55555555-5555-4555-8555-555555555555';
const DEPOT_F = '66666666-6666-4666-8666-666666666666';
const PLAN = '99999999-9999-4999-8999-999999999999';
const id = (n: number): string => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
const [TOWER, FLOOR, ROOM, STORE, DOCK] = [id(1), id(2), id(3), id(4), id(5)] as const;

const area = (
  areaId: string,
  facility: string,
  path: readonly string[],
  name: string,
  more = {},
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
  shape: null,
  path: [...path],
  depth: path.length - 1,
  current_occupancy: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...more,
});

const AREAS = [
  area(TOWER, TOWER_F, [TOWER], 'Tower', { area_type: 'building' }),
  area(FLOOR, TOWER_F, [TOWER, FLOOR], 'Floor 2', {
    area_type: 'floor',
    shape: {
      type: 'Polygon',
      coordinates: [
        [
          [20, 20],
          [1180, 20],
          [1180, 780],
          [20, 780],
          [20, 20],
        ],
      ],
    },
  }),
  area(ROOM, TOWER_F, [TOWER, FLOOR, ROOM], 'Server room', { area_type: 'room' }),
  area(STORE, TOWER_F, [TOWER, FLOOR, STORE], 'Store', {
    shape: {
      type: 'Polygon',
      coordinates: [
        [
          [100, 100],
          [1300, 100],
          [100, 300],
        ],
      ],
    },
  }),
  area(DOCK, DEPOT_F, [DOCK], 'Loading dock'),
];

const PLAN_ROW = {
  id: PLAN,
  facility_id: TOWER_F,
  area_id: FLOOR,
  name: 'Floor 2 plan',
  level: 2,
  image_file_id: null,
  width_px: 1200,
  height_px: 800,
  scale_m_per_px: 0.05,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

interface GraphqlBody {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
}

const bodies = (): GraphqlBody[] =>
  vi.mocked(fetch).mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody);
const mutations = (): GraphqlBody[] =>
  bodies().filter((b) => b.query.trimStart().startsWith('mutation'));

async function serve(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query, variables } = JSON.parse(String(init?.body)) as GraphqlBody;
  const text = `${query} ${JSON.stringify(variables ?? {})}`;
  if (query.trimStart().startsWith('mutation')) return hasuraResponse({ data: { item: AREAS[2] } });
  if (query.includes('areas_by_pk')) {
    return hasuraResponse({ data: { item: AREAS.find((a) => a.id === variables?.id) ?? null } });
  }
  if (/floor_plans/.test(query)) {
    const rows =
      text.includes(TOWER_F) || text.includes(FLOOR) || text.includes(PLAN) ? [PLAN_ROW] : [];
    return hasuraResponse({ data: { items: rows, meta: { aggregate: { count: rows.length } } } });
  }
  if (query.includes('_aggregate'))
    return hasuraResponse({ data: { meta: { aggregate: { count: 1 } } } });
  if (/\bitems: areas\(/.test(query)) {
    const parent = AREAS.find((a) => text.includes(`"${a.id}"`) && /parent_id/.test(query));
    const rows = parent
      ? AREAS.filter((a) => a.parent_id === parent.id)
      : AREAS.filter((a) => !text.includes(TOWER_F) || a.facility_id === TOWER_F);
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

/** A click at plan pixel (x, y): the canvas is laid out at the plan's own size. */
const clickPlan = (canvas: Element, x: number, y: number): void => {
  fireEvent.click(canvas, { clientX: x, clientY: y });
};

beforeAll(installDomShims);

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(serve));
  vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 1200,
    height: 800,
  } as DOMRect);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('area shape in the area form', () => {
  it('should refuse fewer than 3 points and save a closed polygon in plan pixels', async () => {
    renderAt(`/areas/${ROOM}/edit`);
    const canvas = await screen.findByRole('img', {
      name: 'Area shape on the floor plan Floor 2 plan',
    });
    // The floor's outline is drawn faintly for orientation.
    expect(within(canvas).getByText('Floor 2')).toBeDefined();
    clickPlan(canvas, 100, 100);
    clickPlan(canvas, 300, 100);
    expect(screen.getByText('Polygon, 2 points')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    expect(
      await screen.findByText(
        'A shape needs at least 3 different points; add more points or clear the shape.',
      ),
    ).toBeDefined();
    expect(mutations()).toHaveLength(0);

    clickPlan(canvas, 300, 250);
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    const set = mutations()[0]?.variables?.set as Record<string, unknown>;
    expect(set.shape).toEqual({
      type: 'Polygon',
      coordinates: [
        [
          [100, 100],
          [300, 100],
          [300, 250],
          [100, 100],
        ],
      ],
    });
  });

  it('should refuse a stored point outside the floor-plan image', async () => {
    renderAt(`/areas/${STORE}/edit`);
    await screen.findByRole('img', { name: 'Area shape on the floor plan Floor 2 plan' });
    fireEvent.change(screen.getByRole('textbox', { name: /^Name/ }), {
      target: { value: 'Store B' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    expect(
      await screen.findByText('Point 2 (1300, 100) lies outside the floor plan (1200 × 800 px).'),
    ).toBeDefined();
    expect(mutations()).toHaveLength(0);
    // Clearing the shape lets the area save.
    fireEvent.click(screen.getByRole('button', { name: 'Clear shape' }));
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    expect((mutations()[0]?.variables?.set as Record<string, unknown>).shape).toBeNull();
  });

  it('should draw a circle: the centre, then the radius', async () => {
    renderAt(`/areas/${ROOM}/edit`);
    const canvas = await screen.findByRole('img', { name: /Area shape on the floor plan/ });
    fireEvent.click(screen.getByRole('button', { name: 'Circle' }));
    clickPlan(canvas, 600, 400);
    clickPlan(canvas, 630, 440);
    expect(screen.getByText('Circle, radius 50 px')).toBeDefined();
  });

  it('should say when the area lies on no floor plan', async () => {
    renderAt(`/areas/${DOCK}/edit`);
    expect(await screen.findByText(/No floor plan covers this place yet/)).toBeDefined();
    expect(screen.queryByRole('img', { name: /Area shape on the floor plan/ })).toBeNull();
  });
});

describe('area page', () => {
  it('should show the plan the area carries, with the shapes on it', async () => {
    renderAt(`/areas/${FLOOR}?sections=floor_plan`);
    const drawing = await screen.findByRole('img', {
      name: 'Floor plan Floor 2 plan with its areas',
    });
    expect(within(drawing).getByText('Store')).toBeDefined();
  });

  it('should list the sub-areas', async () => {
    renderAt(`/areas/${FLOOR}?sections=sub_areas`);
    expect(await screen.findByRole('row', { name: /Server room/ })).toBeDefined();
    expect(screen.getByRole('row', { name: /Store/ })).toBeDefined();
    expect(screen.queryByRole('row', { name: /Loading dock/ })).toBeNull();
  });

  it('should preview the stored shape on the details tab', async () => {
    renderAt(`/areas/${FLOOR}`);
    expect(await screen.findByText('Polygon, 4 points')).toBeDefined();
  });

  it('should show no floor plan tab for an area without a plan', async () => {
    renderAt(`/areas/${ROOM}`);
    await screen.findByRole('tab', { name: 'Sub-areas' });
    expect(screen.queryByRole('tab', { name: 'Floor plan' })).toBeNull();
  });
});
