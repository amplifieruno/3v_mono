// @vitest-environment jsdom
import { renderBlock } from '@burojs/testing/react';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type * as React from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRuntime } from '../../src/app/runtime';
import { occupancyNowBlock } from '../../src/blocks/occupancy-now/occupancy-now-block';
import { areaTree, occupancyLevel, withOccupancy } from '../../src/blocks/occupancy-now/occupancy-level';
import type { OccupancyRow } from '../../src/blocks/occupancy-now/occupancy-query';
import { occupancyNowView } from '../../src/blocks/occupancy-now/views';
import type { PlanAreaRow } from '../../src/fields/plan-rows';
import { fakeAdminAuth, installDomShims } from '../support/console-dom';

/**
 * The occupancy page's block over a fake Hasura: every figure (the total, the plan's labels and
 * colours, the area list) is the answer of `facility_occupancy_now`, also where the areas' own
 * rows still hold another count (Review Focus 4); a facility with two plans shows one at a time;
 * without a facility the block asks for one and reads nothing.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const FACILITY = '55555555-5555-4555-8555-555555555555';
const id = (n: number): string => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
const [TOWER, FLOOR_1, LOBBY, FLOOR_2, SERVER_ROOM] = [id(1), id(2), id(3), id(4), id(5)] as const;

const rect = (x: number, y: number, w: number, h: number) => ({
  type: 'Polygon',
  coordinates: [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]],
});

const area = (areaId: string, path: readonly string[], name: string, more: Record<string, unknown> = {}) => ({
  id: areaId,
  facility_id: FACILITY,
  name,
  path: [...path],
  shape: null,
  access_level: 'public',
  capacity: null,
  // A stale count the page must not show: the function's figure wins.
  current_occupancy: 99,
  ...more,
});

const AREAS = [
  area(TOWER, [TOWER], 'Tower'),
  area(FLOOR_1, [TOWER, FLOOR_1], 'Floor 1', { shape: rect(0, 0, 1000, 600) }),
  area(LOBBY, [TOWER, FLOOR_1, LOBBY], 'Lobby', { shape: rect(50, 50, 300, 200), capacity: 10 }),
  area(FLOOR_2, [TOWER, FLOOR_2], 'Floor 2', { shape: rect(0, 0, 1000, 600) }),
  area(SERVER_ROOM, [TOWER, FLOOR_2, SERVER_ROOM], 'Server room', { shape: rect(100, 100, 100, 100), capacity: 1 }),
];

const plan = (planId: string, areaId: string, name: string) => ({
  id: planId,
  facility_id: FACILITY,
  area_id: areaId,
  name,
  image_file_id: null,
  width_px: 1000,
  height_px: 600,
});
const PLANS = [plan(id(11), FLOOR_1, 'Floor 1 plan'), plan(id(12), FLOOR_2, 'Floor 2 plan')];

const row = (areaId: string | null, parent: string | null, name: string, occupancy: number, direct: number, capacity: number | null = null): OccupancyRow => ({
  area_id: areaId,
  parent_id: parent,
  name,
  capacity,
  occupancy,
  direct_occupancy: direct,
});

const ROWS: OccupancyRow[] = [
  row(null, null, 'Nova Tower', 6, 6),
  row(TOWER, null, 'Tower', 6, 0),
  row(FLOOR_1, TOWER, 'Floor 1', 4, 1),
  row(LOBBY, FLOOR_1, 'Lobby', 3, 3, 10),
  row(FLOOR_2, TOWER, 'Floor 2', 2, 0),
  row(SERVER_ROOM, FLOOR_2, 'Server room', 2, 2, 1),
];

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

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
  Object.entries(occupancyNowBlock.texts as Record<string, unknown>).filter(([, value]) => typeof value === 'string'),
) as Record<string, string>;

const render = (facilityId: string | null) =>
  renderBlock(occupancyNowView, {
    props: { facilityId },
    data: { plans: { rows: PLANS }, areas: { rows: AREAS, total: AREAS.length } },
    wrapper: Wrapper,
    messages: MESSAGES,
  });

const occupancyReads = () =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([, init]) => String(init?.body ?? '').includes('facility_occupancy_now'));

beforeAll(installDomShims);

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      String(init?.body ?? '').includes('facility_occupancy_now')
        ? json({ data: { facility_occupancy_now: ROWS } })
        : json({ data: {} }),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('occupancy figures', () => {
  it('should grade an area against its capacity, or as occupied without one', () => {
    expect(occupancyLevel(0, 10)).toBe('empty');
    expect(occupancyLevel(2, 10)).toBe('low');
    expect(occupancyLevel(5, 10)).toBe('medium');
    expect(occupancyLevel(9, 10)).toBe('high');
    expect(occupancyLevel(10, 10)).toBe('high');
    expect(occupancyLevel(11, 10)).toBe('over');
    expect(occupancyLevel(3, null)).toBe('occupied');
    expect(occupancyLevel(0, null)).toBe('empty');
  });

  it('should give the plan’s areas the function’s figures and list the areas as a tree', () => {
    const areas = [{ id: LOBBY, capacity: null, current_occupancy: 99 }, { id: id(9), capacity: 5, current_occupancy: 4 }] as PlanAreaRow[];
    expect(withOccupancy(areas, ROWS).map((a) => [a.current_occupancy, a.capacity])).toEqual([
      [3, 10],
      [0, 5],
    ]);
    expect(areaTree(ROWS).map((entry) => `${'-'.repeat(entry.depth)}${entry.row.name}:${entry.level}`)).toEqual([
      'Tower:occupied',
      '-Floor 1:occupied',
      '--Lobby:low',
      '-Floor 2:occupied',
      '--Server room:over',
    ]);
  });
});

describe('occupancy now block', () => {
  it('should show the function’s figures on the plan and in the list (Review Focus 4)', async () => {
    await render(FACILITY);
    expect(await screen.findByTestId('occupancy-total')).toHaveProperty('textContent', '6');
    const variables = JSON.parse(String(occupancyReads()[0]?.[1]?.body)) as { variables: unknown };
    expect(variables.variables).toEqual({ facility: FACILITY });

    const drawing = screen.getByRole('img', { name: 'Floor plan Floor 1 plan coloured by occupancy' });
    const titles = [...drawing.querySelectorAll('path > title')].map((t) => t.textContent);
    expect(titles).toEqual(['Floor 1: 4 inside', 'Lobby: 3 / 10']);
    expect(drawing.querySelectorAll('path')[1]?.getAttribute('class')).toContain('fill-emerald-500/25');

    const list = screen.getByTestId('occupancy-areas');
    expect(within(list).getByTestId(`occupancy-area:${LOBBY}`).textContent).toContain('3 / 10');
    const server = within(list).getByTestId(`occupancy-area:${SERVER_ROOM}`);
    expect(server.textContent).toContain('2 / 1');
    expect(server.textContent).toContain('Over capacity');
    expect(within(list).getByTestId(`occupancy-area:${FLOOR_1}`).textContent).toContain('1 here, the rest in sub-areas');
    expect(screen.queryByText(/99/)).toBeNull();
  });

  it('should show one plan at a time and switch between the facility’s plans', async () => {
    await render(FACILITY);
    await screen.findByRole('img', { name: 'Floor plan Floor 1 plan coloured by occupancy' });
    fireEvent.click(screen.getByRole('button', { name: 'Floor 2 plan' }));
    const drawing = await screen.findByRole('img', { name: 'Floor plan Floor 2 plan coloured by occupancy' });
    const server = [...drawing.querySelectorAll('path')].find((path) => path.querySelector('title')?.textContent === 'Server room: 2 / 1');
    expect(server?.getAttribute('class')).toContain('stroke-destructive');
    expect(screen.getByRole('button', { name: 'Floor 2 plan' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('should ask for a facility and read nothing without one', async () => {
    await render(null);
    expect(await screen.findByText(MESSAGES.chooseFacility ?? '')).toBeDefined();
    await waitFor(() => expect(occupancyReads()).toHaveLength(0));
  });
});
