// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * The facility screens: the list with the system counts, the show page with the
 * occupancy facts and its tabs, and the edit form with the custom attribute values: a
 * required attribute blocks saving, an inactive one is not offered, and values of
 * inactive or removed attributes are kept in what is saved.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const FACILITY = '55555555-5555-4555-8555-555555555555';

const ROW = {
  id: FACILITY,
  code: 'FACILITY-00001',
  name: 'Nova Tower',
  status: 'active',
  description: null,
  address: '24 Presnenskaya Embankment, Moscow',
  latitude: 55.7496,
  longitude: 37.5376,
  timezone: 'Europe/Moscow',
  operating_hours: [] as unknown[],
  contact: { phone: '+7 495 000-00-24' },
  custom_fields: { legacy_code: 'NT-1', removed_attr: 'kept', floors: 12 } as Record<string, unknown>,
  areas_count: 14,
  current_occupancy: 37,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
};

const DEF = {
  entity: 'facility',
  options: null,
  validation: null,
  visible_when: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};
const DEFINITIONS = [
  { ...DEF, id: 'd1', key: 'fire_permit', label: 'Fire permit', data_type: 'string', required: true, is_active: true, sort_order: 10 },
  { ...DEF, id: 'd2', key: 'floors', label: 'Floors', data_type: 'number', required: false, is_active: true, sort_order: 20 },
  { ...DEF, id: 'd3', key: 'legacy_code', label: 'Legacy code', data_type: 'string', required: true, is_active: false, sort_order: 30 },
];

const OCCUPANCY = [
  { area_id: null, capacity: null, occupancy: 37, direct_occupancy: 37 },
  { area_id: 'a1', capacity: 10, occupancy: 12, direct_occupancy: 12 },
  { area_id: 'a2', capacity: 50, occupancy: 25, direct_occupancy: 25 },
  { area_id: 'a3', capacity: null, occupancy: 0, direct_occupancy: 0 },
];

interface GraphqlBody {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
}

const mutations = (): GraphqlBody[] =>
  vi
    .mocked(fetch)
    .mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody)
    .filter((body) => body.query.trimStart().startsWith('mutation'));

/** Hasura serving `row` as the only facility, the attribute definitions and the occupancy rows. */
const graphqlServing =
  (row: typeof ROW) =>
  async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const { query } = JSON.parse(String(init?.body)) as GraphqlBody;
    if (query.trimStart().startsWith('mutation')) return hasuraResponse({ data: { item: row } });
    if (query.includes('facility_occupancy_now')) {
      return hasuraResponse({ data: { facility_occupancy_now: OCCUPANCY } });
    }
    const data = query.includes('facilities_by_pk')
      ? { item: row }
      : query.includes('_aggregate')
        ? { meta: { aggregate: { count: 1 } } }
        : query.includes('custom_attribute_definitions(')
          ? { items: DEFINITIONS }
          : { items: query.includes('facilities(') ? [row] : [] };
    return hasuraResponse({ data });
  };

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ConsoleApp auth={fakeAdminAuth(NOVA, 'Nova Tower Business Center')} />
    </MemoryRouter>,
  );

beforeAll(installDomShims);

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(graphqlServing(ROW)));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('facility list', () => {
  it('should list facilities with their code, zone and system counts', async () => {
    renderAt('/facilities');
    const row = await screen.findByRole('row', { name: /Nova Tower/ });
    expect(within(row).getByText('FACILITY-00001')).toBeDefined();
    expect(within(row).getByText(/Europe\/Moscow/).textContent).toBe('Europe/Moscow (UTC+03:00)');
    expect(within(row).getByText('14')).toBeDefined();
    expect(within(row).getByText('37')).toBeDefined();
  });
});

describe('facility page', () => {
  it('should show the occupancy facts in the header and the details tab', async () => {
    renderAt(`/facilities/${FACILITY}`);
    expect(await screen.findByText('Occupied areas')).toBeDefined();
    expect(screen.getByText('Areas over capacity')).toBeDefined();
    const facts = screen.getByText('Occupied areas').closest('[data-buro-facts]');
    if (facts === null) throw new Error('no facts');
    // 37 on site; areas a1 and a2 occupied; a1 holds 12 of 10.
    expect(within(facts as HTMLElement).getByText('37')).toBeDefined();
    expect(within(facts as HTMLElement).getByText('2')).toBeDefined();
    expect(within(facts as HTMLElement).getByText('1')).toBeDefined();
    // No operating hours: always open.
    expect(screen.getByText('Always open')).toBeDefined();
    // Custom attribute values with their labels, kept ones under their label or key.
    expect(screen.getByText('Floors')).toBeDefined();
    expect(screen.getByText('Legacy code')).toBeDefined();
    expect(screen.getByText('removed_attr')).toBeDefined();
  });

  it('should hold the areas and access points tabs', async () => {
    renderAt(`/facilities/${FACILITY}?sections=areas`);
    expect(await screen.findByText(/area tree \(floors, zones and rooms\)/)).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Access points' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Details' })).toBeDefined();
  });
});

describe('facility form: custom attributes', () => {
  it('blocks saving while a required custom attribute is empty and keeps removed values', async () => {
    renderAt(`/facilities/${FACILITY}/edit`);

    const floors = await screen.findByLabelText(/^Floors/);
    expect((floors as HTMLInputElement).value).toBe('12');
    // The inactive attribute is not offered; its stored value is listed as kept.
    expect(screen.queryByLabelText(/^Legacy code/)).toBeNull();
    expect(screen.getByText('Kept values')).toBeDefined();
    expect(screen.getByText('Inactive attribute; kept as stored.')).toBeDefined();

    fireEvent.change(floors, { target: { value: '14' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    // The value of the deleted attribute is not dropped: the form names it (the database
    // checks unknown keys first and would refuse it) and offers to remove it.
    expect(await screen.findByText(/No custom attribute “removed_attr” exists any more/)).toBeDefined();
    expect(mutations()).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Remove the value of removed_attr' }));
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    expect(await screen.findByText('Fire permit is required.')).toBeDefined();
    expect(mutations()).toHaveLength(0);

    fireEvent.change(screen.getByLabelText(/^Fire permit/), { target: { value: 'FP-7' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    const set = mutations()[0]?.variables?.set as Record<string, unknown>;
    expect(set.custom_fields).toEqual({ legacy_code: 'NT-1', floors: 14, fire_permit: 'FP-7' });
  });

  it('should save other columns of a facility whose custom attributes are unchanged', async () => {
    renderAt(`/facilities/${FACILITY}/edit`);
    const name = await screen.findByRole('textbox', { name: /^Name/ });
    await screen.findByLabelText(/^Floors/);
    fireEvent.change(name, { target: { value: 'Nova Tower East' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    const set = mutations()[0]?.variables?.set as Record<string, unknown>;
    expect(set.name).toBe('Nova Tower East');
  });

  it('should refuse a create without the required attribute and an out-of-range latitude', async () => {
    renderAt('/facilities/create');
    const name = await screen.findByRole('textbox', { name: /^Name/ });
    await screen.findByLabelText(/^Fire permit/);
    fireEvent.change(name, { target: { value: 'Depot' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: /^Latitude/ }), {
      target: { value: '91' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create|Save/ }));
    expect(await screen.findByText('Fire permit is required.')).toBeDefined();
    expect(screen.getByText('Enter a number from -90 to 90.')).toBeDefined();
    expect(mutations()).toHaveLength(0);
  });
});
