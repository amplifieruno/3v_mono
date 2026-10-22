// @vitest-environment jsdom
import type { ScalarDisplayProps, ScalarInputProps } from '@burojs/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRuntime } from '../../src/app/runtime';
import { PlanPositionDisplay } from '../../src/fields/plan-position-display';
import { PlanPositionInput } from '../../src/fields/plan-position-input';
import type { PlanPositionMeta } from '../../src/fields/plan-position-meta';
import { planSizeFor } from '../../src/fields/plan-size-registry';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * The `itap.plan-position` input (Task 4 places it on access points): a click on the floor plan
 * of the record's area (found through its enclosing floor) sets `[x, y]` in plan pixels, Clear
 * removes it, the plan size is published for the validator; the display shows the coordinates.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const FACILITY = '55555555-5555-4555-8555-555555555555';
const [FLOOR, ROOM] = [
  'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
  'aaaaaaaa-aaaa-4aaa-8aaa-000000000003',
];
const META: PlanPositionMeta = {
  channel: 'planPosition#test',
  areaField: 'area_id',
  facilityField: 'facility_id',
};

async function serve(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query } = JSON.parse(String(init?.body)) as { query: string };
  if (query.includes('floor_plans')) {
    return hasuraResponse({
      data: {
        items: [
          {
            id: 'plan',
            facility_id: FACILITY,
            area_id: FLOOR,
            name: 'Floor 2',
            image_file_id: null,
            width_px: 1200,
            height_px: 800,
          },
        ],
      },
    });
  }
  if (query.includes('areas')) {
    return hasuraResponse({
      data: {
        items: [
          { id: FLOOR, facility_id: FACILITY, name: 'Floor 2', path: [FLOOR] },
          { id: ROOM, facility_id: FACILITY, name: 'Room', path: [FLOOR, ROOM] },
        ],
      },
    });
  }
  return hasuraResponse({ data: { items: [] } });
}

function renderInput(
  value: unknown,
  form: Record<string, unknown>,
  onChange: (value: unknown) => void,
) {
  const props = {
    meta: META,
    value,
    onChange,
    form,
    presentation: 'default',
    accessibility: { input: 'position' },
    testIds: { input: 'position-input' },
    issues: [],
    multiple: false,
  } as unknown as ScalarInputProps<unknown, PlanPositionMeta>;
  return render(
    <AppRuntime auth={fakeAdminAuth(ORG, 'Nova')} initialOrganizationId={ORG}>
      <PlanPositionInput {...props} />
    </AppRuntime>,
  );
}

beforeAll(installDomShims);

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(serve));
  vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 600,
    height: 400,
  } as DOMRect);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('plan position field', () => {
  it('should place the point with a click on the plan of the area’s floor', async () => {
    const onChange = vi.fn();
    renderInput(null, { facility_id: FACILITY, area_id: ROOM }, onChange);
    const canvas = await screen.findByRole('img', { name: 'Position on the floor plan Floor 2' });
    expect(planSizeFor(META.channel)).toEqual({ width: 1200, height: 800 });
    // Drawn at half size: a click at (150, 100) is plan pixel (300, 200).
    fireEvent.click(canvas, { clientX: 150, clientY: 100 });
    expect(onChange).toHaveBeenCalledWith([300, 200]);
  });

  it('should show the point and clear it', async () => {
    const onChange = vi.fn();
    renderInput([300, 200], { facility_id: FACILITY, area_id: ROOM }, onChange);
    expect(await screen.findByText('x 300, y 200 px')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Clear position' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('should ask for the facility first', async () => {
    renderInput(null, { area_id: ROOM }, vi.fn());
    expect(
      await screen.findByText('Choose the facility first; the floor plan comes from it.'),
    ).toBeDefined();
  });

  it('should display the coordinates, or a dash', async () => {
    const display = (value: unknown) =>
      ({
        value,
        meta: META,
        testIds: {},
        presentation: 'default',
        multiple: false,
      }) as unknown as ScalarDisplayProps<unknown, PlanPositionMeta>;
    const wrap = (node: React.ReactNode) =>
      render(
        <AppRuntime auth={fakeAdminAuth(ORG, 'Nova')} initialOrganizationId={ORG}>
          {node}
        </AppRuntime>,
      );
    wrap(<PlanPositionDisplay {...display([12, 34])} />);
    expect(await screen.findByText('x 12, y 34 px')).toBeDefined();
    cleanup();
    wrap(<PlanPositionDisplay {...display({ x: 1 })} />);
    expect(await screen.findByText('—')).toBeDefined();
  });
});
