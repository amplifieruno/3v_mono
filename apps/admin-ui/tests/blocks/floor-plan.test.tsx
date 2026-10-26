// @vitest-environment jsdom
import { renderBlock } from '@burojs/testing/react';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import type * as React from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRuntime } from '../../src/app/runtime';
import { floorPlanView } from '../../src/blocks/floor-plan/views';
import { fakeAdminAuth, installDomShims } from '../support/console-dom';

/**
 * The `itap:floor-plan` block with fake rows: the plan's image (presigned from storage), the
 * shapes of the plan's area and of the areas inside it only (other floors and shapeless areas
 * are left out), labels with occupancy (red past capacity), the legend linking each area,
 * access points by kind, and devices by type and health with their coverage, the access points
 * and cameras named beside their icons.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const FACILITY = '55555555-5555-4555-8555-555555555555';
const PLAN = '99999999-9999-4999-8999-999999999999';
const IMAGE = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const id = (n: number): string => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
const [TOWER, FLOOR, ROOM, LOUNGE, OTHER_FLOOR, OTHER_ROOM, NO_SHAPE] = [
  id(1),
  id(2),
  id(3),
  id(4),
  id(5),
  id(6),
  id(7),
] as const;

const rect = (x: number, y: number, w: number, h: number) => ({
  type: 'Polygon',
  coordinates: [
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
      [x, y],
    ],
  ],
});

const area = (
  areaId: string,
  path: readonly string[],
  name: string,
  more: Record<string, unknown>,
) => ({
  id: areaId,
  facility_id: FACILITY,
  name,
  path: [...path],
  shape: null,
  access_level: 'public',
  capacity: null,
  current_occupancy: 0,
  ...more,
});

const PLAN_ROW = {
  id: PLAN,
  facility_id: FACILITY,
  area_id: FLOOR,
  name: 'Floor 2',
  image_file_id: IMAGE,
  width_px: 1200,
  height_px: 800,
  scale_m_per_px: 0.05,
};

const AREAS = [
  area(TOWER, [TOWER], 'Tower', { shape: rect(0, 0, 1200, 800) }),
  area(FLOOR, [TOWER, FLOOR], 'Floor 2', { shape: rect(20, 20, 1160, 760) }),
  area(ROOM, [TOWER, FLOOR, ROOM], 'Server room', {
    shape: rect(60, 60, 200, 200),
    access_level: 'secure',
    capacity: 2,
    current_occupancy: 3,
  }),
  area(LOUNGE, [TOWER, FLOOR, LOUNGE], 'Lounge', {
    shape: { type: 'Circle', center: [900, 400], radius: 120 },
    capacity: 40,
    current_occupancy: 5,
  }),
  area(NO_SHAPE, [TOWER, FLOOR, NO_SHAPE], 'Corridor', {}),
  area(OTHER_FLOOR, [TOWER, OTHER_FLOOR], 'Floor 3', { shape: rect(20, 20, 1160, 760) }),
  area(OTHER_ROOM, [TOWER, OTHER_FLOOR, OTHER_ROOM], 'Kitchen', {
    shape: rect(300, 300, 100, 100),
  }),
];

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

function Wrapper({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  return (
    <MemoryRouter>
      <AppRuntime auth={fakeAdminAuth(ORG, 'Nova')} initialOrganizationId={ORG}>
        {children}
      </AppRuntime>
    </MemoryRouter>
  );
}

const render = (data: Record<string, unknown>) =>
  renderBlock(floorPlanView, {
    props: { floorPlanId: PLAN },
    data,
    wrapper: Wrapper,
    messages: {
      none: 'No floor plan.',
      drawing: 'Floor plan {{name}} with its areas',
      legend: 'Areas on this plan',
      occupancy: '{{occupancy}} / {{capacity}}',
      occupancyOnly: '{{occupancy}} inside',
      overCapacity: 'Over capacity',
      noShapes: 'No shapes',
      size: '{{width}} × {{height}} px',
      scale: '1 px = {{scale}} m',
      device: '{{name}} ({{health}})',
      health_healthy: 'healthy',
      health_warning: 'no frames',
      health_critical: 'offline',
      health_unknown: 'health unknown',
    },
  });

beforeAll(installDomShims);

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes(`/v1/files/${IMAGE}/presignedurl`)
        ? json({ url: 'http://storage.test/floor-2.png', expiration: 60 })
        : json({ data: {} }),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('floor plan block', () => {
  it('should draw the plan image with the shapes of the areas on it only', async () => {
    await render({ plans: { rows: [PLAN_ROW] }, areas: { rows: AREAS, total: AREAS.length } });

    const drawing = await screen.findByRole('img', { name: 'Floor plan Floor 2 with its areas' });
    await waitFor(() =>
      expect(drawing.querySelector('image')?.getAttribute('href')).toBe(
        'http://storage.test/floor-2.png',
      ),
    );
    expect(drawing.getAttribute('viewBox')).toBe('0 0 1200 800');
    // The floor's outline, the room's polygon and the lounge's circle; not the tower, not floor 3.
    const titles = [...drawing.querySelectorAll('path > title, circle > title')].map(
      (t) => t.textContent,
    );
    expect(titles).toEqual(['Floor 2: 0 inside', 'Server room: 3 / 2', 'Lounge: 5 / 40']);
    expect(drawing.querySelector('circle')?.getAttribute('r')).toBe('120');
    expect(screen.getByText('1200 × 800 px · 1 px = 0.05 m')).toBeDefined();
  });

  it('should label each area with its occupancy and mark one over capacity', async () => {
    await render({ plans: { rows: [PLAN_ROW] }, areas: { rows: AREAS, total: AREAS.length } });

    const room = await screen.findByTestId(`floor-plan-label:${ROOM}`);
    expect(room.textContent).toBe('Server room3 / 2');
    expect(room.querySelectorAll('tspan')[1]?.getAttribute('class')).toContain('fill-destructive');
    // The plan's own area is outlined, not labelled over the whole sheet.
    expect(screen.queryByTestId(`floor-plan-label:${FLOOR}`)).toBeNull();

    const legend = screen.getByRole('list', { name: 'Areas on this plan' });
    const links = within(legend).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Floor 2', 'Server room', 'Lounge']);
    expect(links[1]?.getAttribute('href')).toBe(`/areas/${ROOM}`);
    expect(within(legend).getByText('Over capacity')).toBeDefined();
  });

  it('should draw the access points of the plan’s areas by kind at their positions', async () => {
    await render({
      plans: { rows: [PLAN_ROW] },
      areas: { rows: AREAS, total: AREAS.length },
      accessPoints: {
        rows: [
          { id: id(20), name: 'Main door', kind: 'door', area_id: FLOOR, position: [600, 780] },
          {
            id: id(21),
            name: 'Turnstile 1',
            kind: 'turnstile',
            area_id: ROOM,
            position: [500, 400],
          },
          { id: id(22), name: 'Unplaced', kind: 'gate', area_id: FLOOR, position: null },
          // Leads into an area of floor 3: drawn on that floor's plan, not this one.
          {
            id: id(23),
            name: 'Kitchen door',
            kind: 'door',
            area_id: OTHER_ROOM,
            position: [10, 10],
          },
        ],
      },
    });

    const door = await screen.findByTestId(`floor-plan-access-point:${id(20)}`);
    expect(door.querySelector('title')?.textContent).toBe('Main door');
    expect(door.querySelector('circle')?.getAttribute('cx')).toBe('600');
    expect(door.querySelector('svg')?.getAttribute('class')).toContain('lucide-door-open');
    const turnstile = screen.getByTestId(`floor-plan-access-point:${id(21)}`);
    expect(turnstile.querySelector('svg')?.getAttribute('class')).toContain(
      'lucide-arrow-left-right',
    );
    expect(screen.queryByTestId(`floor-plan-access-point:${id(22)}`)).toBeNull();
    expect(screen.queryByTestId(`floor-plan-access-point:${id(23)}`)).toBeNull(); // Each placed access point is named beside its icon.
    expect(screen.getByTestId(`floor-plan-point-label:${id(20)}`).textContent).toBe('Main door');
    expect(screen.getByTestId(`floor-plan-point-label:${id(21)}`).textContent).toBe('Turnstile 1');
  });

  it('should draw the positioned devices of the plan’s areas by type and health', async () => {
    const device = (n: number, more: Record<string, unknown>) => ({
      id: id(n),
      area_id: ROOM,
      name: `Device ${n}`,
      device_type: 'static_video_camera',
      health_status: 'healthy',
      position: [100, 100],
      coverage: null,
      ...more,
    });
    await render({
      plans: { rows: [PLAN_ROW] },
      areas: { rows: AREAS, total: AREAS.length },
      devices: {
        rows: [
          device(30, {
            name: 'Server room camera',
            coverage: {
              type: 'Polygon',
              coordinates: [
                [
                  [100, 100],
                  [250, 60],
                  [250, 140],
                  [100, 100],
                ],
              ],
            },
          }),
          device(31, {
            name: 'Lobby terminal',
            device_type: 'access_terminal',
            health_status: 'critical',
            area_id: FLOOR,
          }),
          // Installed on floor 3: drawn on that floor's plan, not this one.
          device(32, { area_id: OTHER_ROOM }),
          // No area: no plan to draw it on.
          device(33, { area_id: null }),
        ],
      },
    });

    const camera = await screen.findByTestId(`floor-plan-device:${id(30)}`);
    expect(camera.querySelector('title')?.textContent).toBe('Server room camera (healthy)');
    expect(camera.querySelector('svg')?.getAttribute('class')).toContain('lucide-cctv');
    expect(camera.querySelector('circle')?.getAttribute('class')).toContain('stroke-emerald-600');
    const terminal = screen.getByTestId(`floor-plan-device:${id(31)}`);
    expect(terminal.querySelector('title')?.textContent).toBe('Lobby terminal (offline)');
    expect(terminal.querySelector('svg')?.getAttribute('class')).toContain('lucide-scan-face');
    expect(terminal.querySelector('circle')?.getAttribute('class')).toContain('stroke-destructive');
    expect(screen.queryByTestId(`floor-plan-device:${id(32)}`)).toBeNull();
    expect(screen.queryByTestId(`floor-plan-device:${id(33)}`)).toBeNull();
    // Cameras are named beside their icons; terminals go by the access point they serve.
    expect(screen.getByTestId(`floor-plan-point-label:${id(30)}`).textContent).toBe(
      'Server room camera',
    );
    expect(screen.queryByTestId(`floor-plan-point-label:${id(31)}`)).toBeNull();
    // The camera's coverage is drawn as a dashed outline.
    const drawing = screen.getByRole('img', { name: 'Floor plan Floor 2 with its areas' });
    const outlines = [...drawing.querySelectorAll('path')].filter((path) =>
      path.getAttribute('class')?.includes('stroke-dasharray'),
    );
    expect(outlines).toHaveLength(1);
  });

  it('should leave out areas drawn on a nearer plan of their own', async () => {
    // The server room carries its own plan: its shape is in that plan's pixels, not Floor 2's.
    const roomPlan = { ...PLAN_ROW, id: 'room-plan', area_id: ROOM, name: 'Server room plan' };
    await render({
      plans: { rows: [PLAN_ROW] },
      facilityPlans: { rows: [PLAN_ROW, roomPlan] },
      areas: { rows: AREAS, total: AREAS.length },
    });
    const drawing = await screen.findByRole('img', { name: 'Floor plan Floor 2 with its areas' });
    const titles = [...drawing.querySelectorAll('path > title, circle > title')].map(
      (t) => t.textContent,
    );
    expect(titles).toEqual(['Floor 2: 0 inside', 'Lounge: 5 / 40']);
    expect(screen.queryByTestId(`floor-plan-label:${ROOM}`)).toBeNull();
  });

  it('should say when there is no plan, and when no area has a shape', async () => {
    const empty = await render({ plans: { rows: [] }, areas: { rows: [] } });
    expect(await screen.findByText('No floor plan.')).toBeDefined();
    empty.unmount();

    await render({
      plans: { rows: [{ ...PLAN_ROW, image_file_id: null }] },
      areas: { rows: [], total: 0 },
    });
    expect(await screen.findByText('No shapes')).toBeDefined();
    // Without an image the plan is a blank sheet of its size.
    const drawing = screen.getByRole('img', { name: 'Floor plan Floor 2 with its areas' });
    expect(drawing.querySelector('image')).toBeNull();
    expect(drawing.querySelector('rect')?.getAttribute('width')).toBe('1200');
  });
});
