// @vitest-environment jsdom
import type { ScalarInputProps } from '@burojs/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppRuntime } from '../../src/app/runtime';
import {
  hiddenPanels,
  movePanel,
  togglePanel,
  workspacePanels,
} from '../../src/fields/workspace-panels-format';
import { WorkspacePanelsInput } from '../../src/fields/workspace-panels-input';
import { layoutOf, occupancyFactsOf } from '../../src/modules/monitoring/operator-workspace-query';
import { fakeAdminAuth, installDomShims } from '../support/console-dom';

/**
 * An operator workspace's layout (`itap.workspace-panels`): which panels the workspace page shows
 * and in which order, stored as `{ panels: [...] }`; the page's slots read from it; and the
 * occupancy panel's figures summed from `facility_occupancy_now`.
 */

const ORG = '11111111-1111-4111-8111-111111111111';

function renderInput(value: unknown) {
  const onChange = vi.fn();
  const props = {
    meta: {},
    presentation: 'default',
    accessibility: { input: 'layout' },
    testIds: { input: 'layout-input' },
    multiple: false,
    issues: [],
    value,
    onChange,
  } as unknown as ScalarInputProps<unknown, Record<never, never>>;
  render(
    <AppRuntime auth={fakeAdminAuth(ORG, 'Nova')} initialOrganizationId={ORG}>
      <WorkspacePanelsInput {...props} />
    </AppRuntime>,
  );
  return onChange;
}

beforeAll(installDomShims);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('workspace layout', () => {
  it('should show every panel in the default order until the layout names some', () => {
    expect(workspacePanels({})).toEqual(['cameras', 'incidents', 'events', 'occupancy']);
    expect(workspacePanels(null)).toEqual(['cameras', 'incidents', 'events', 'occupancy']);
    expect(workspacePanels({ panels: [] })).toEqual([]);
    expect(workspacePanels({ panels: ['events', 'nope', 'events', 'cameras'] })).toEqual(['events', 'cameras']);
  });

  it('should read the seeded layouts, whose panels are { type } objects', () => {
    const seeded = {
      panels: [{ type: 'camera', title: 'Lobby' }, { type: 'camera', title: 'Dock' }, { type: 'event_feed' }, { type: 'bogus' }],
      columns: 2,
    };
    expect(workspacePanels(seeded)).toEqual(['cameras', 'events']);
    expect(workspacePanels({ panels: [{ type: 'incident_queue' }, { type: 'occupancy' }] })).toEqual(['incidents', 'occupancy']);
  });

  it('should hide, show and move panels, keeping other keys', () => {
    const layout = { panels: ['cameras', 'incidents'], theme: 'dark' };
    expect(togglePanel(layout, 'cameras', false)).toEqual({ panels: ['incidents'], theme: 'dark' });
    expect(togglePanel(layout, 'events', true)).toEqual({ panels: ['cameras', 'incidents', 'events'], theme: 'dark' });
    expect(movePanel(layout, 'incidents', -1)).toEqual({ panels: ['incidents', 'cameras'], theme: 'dark' });
    expect(movePanel(layout, 'incidents', 1)).toEqual(layout);
    expect(hiddenPanels(layout)).toEqual(['events', 'occupancy']);
  });

  it('should lay the page out in slots, an unused slot empty', () => {
    expect(layoutOf({ id: 'w1', name: 'Night desk', layout: { panels: ['events', 'incidents'] } })).toEqual({
      workspace_id: 'w1',
      workspace_name: 'Night desk',
      slot1: 'events',
      slot2: 'incidents',
      slot3: '',
      slot4: '',
    });
    expect(layoutOf(undefined)).toMatchObject({ workspace_id: null, slot1: 'cameras', slot4: 'occupancy' });
  });

  it('should edit the layout row by row', async () => {
    const onChange = renderInput({ panels: ['incidents', 'cameras'] });
    expect(await screen.findByLabelText('1. Open incidents')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Move Live cameras up' }));
    expect(onChange).toHaveBeenLastCalledWith({ panels: ['cameras', 'incidents'] });
    fireEvent.click(screen.getByLabelText('Occupancy'));
    expect(onChange).toHaveBeenLastCalledWith({ panels: ['incidents', 'cameras', 'occupancy'] });
    fireEvent.click(screen.getByLabelText('1. Open incidents'));
    expect(onChange).toHaveBeenLastCalledWith({ panels: ['cameras'] });
  });
});

describe('occupancy figures', () => {
  it('should sum up the facility and its areas', () => {
    const row = (area_id: string | null, name: string, occupancy: number, capacity: number | null) => ({
      area_id,
      parent_id: null,
      name,
      capacity,
      occupancy,
      direct_occupancy: occupancy,
    });
    expect(
      occupancyFactsOf([row(null, 'Nova Tower', 42, 500), row('a1', 'Lobby', 30, 20), row('a2', 'Floor 2', 12, null)]),
    ).toEqual({ on_site: 42, capacity: 500, areas_over_capacity: 1, busiest_area: 'Lobby (30)' });
    expect(occupancyFactsOf([])).toEqual({ on_site: 0, capacity: null, areas_over_capacity: 0, busiest_area: null });
  });
});
