// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { facilityStorageKey } from '../../src/app/scope';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * The facility's "Apply template" form offers this facility's areas for "Inside" whatever the
 * sidebar facility holds (the facility record carries no `facility_id`, so the select is put
 * in this facility's area scope: `inRecordScope`).
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const TOWER_F = '55555555-5555-4555-8555-555555555555';
const DEPOT_F = '66666666-6666-4666-8666-666666666666';
const FLOOR = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002';
const DOCK = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000005';

const facility = (id: string, name: string) => ({
  id,
  name,
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
});
const FACILITIES = [facility(TOWER_F, 'Nova Tower'), facility(DEPOT_F, 'Depot')];

const area = (id: string, facilityId: string, name: string) => ({
  id,
  facility_id: facilityId,
  parent_id: null,
  name,
  area_type: 'floor',
  access_level: 'public',
  status: 'active',
  description: null,
  capacity: null,
  loitering_threshold_seconds: null,
  path: [id],
  depth: 0,
  current_occupancy: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});
const AREAS = [area(FLOOR, TOWER_F, 'Floor 2'), area(DOCK, DEPOT_F, 'Loading dock')];

/** Hasura answering area lists with every facility id the read names (all must hold). */
async function serve(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query, variables } = JSON.parse(String(init?.body)) as { query: string; variables?: unknown };
  const text = `${query} ${JSON.stringify(variables ?? {})}`;
  if (query.includes('facilities_by_pk')) {
    const id = (variables as { id?: string } | undefined)?.id;
    return hasuraResponse({ data: { item: FACILITIES.find((f) => f.id === id) ?? null } });
  }
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 0 } } } });
  if (query.includes('facility_occupancy_now')) return hasuraResponse({ data: { facility_occupancy_now: [] } });
  if (/\bitems: areas\(/.test(query)) {
    const named = FACILITIES.map((f) => f.id).filter((id) => text.includes(id));
    return hasuraResponse({ data: { items: AREAS.filter((a) => named.every((id) => a.facility_id === id)) } });
  }
  if (/\bitems: facilities\(/.test(query)) return hasuraResponse({ data: { items: FACILITIES } });
  return hasuraResponse({ data: { items: [] } });
}

beforeAll(() => {
  installDomShims();
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => undefined;
});

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

describe('apply template: the Inside select', () => {
  it('should offer this facility’s areas while the sidebar is on another facility', async () => {
    localStorage.setItem(facilityStorageKey(NOVA), DEPOT_F);
    render(
      <MemoryRouter initialEntries={[`/facilities/${TOWER_F}`]}>
        <ConsoleApp auth={fakeAdminAuth(NOVA, 'Nova Tower Business Center')} />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByTestId('form-action:facility:show:apply_template'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('combobox', { name: /^Inside/ }));
    expect(await screen.findByRole('option', { name: /Floor 2/ })).toBeDefined();
    expect(screen.queryByRole('option', { name: /Loading dock/ })).toBeNull();
  });
});
