// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * Profile screens: the type offer on create and the fields of each type, the date order refused
 * before any request, the restricted and erased notices, the Activity facts (and their absence),
 * no Delete, and a company's People tab listing its profiles.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const AURORA = '22222222-2222-4222-8222-000000000001';
const ANNA = '33333333-3333-4333-8333-000000000001';
const RESTRICTED = '33333333-3333-4333-8333-000000000002';
const ERASED = '33333333-3333-4333-8333-000000000003';

const base = {
  status: 'active',
  email: null,
  phone: null,
  company_id: AURORA,
  employee_id: 'AUR-001',
  department: 'Finance',
  job_title: 'Analyst',
  work_schedule_id: null,
  access_level: 'standard',
  start_date: '2024-01-15',
  end_date: null,
  avatar_file_id: null,
  external_id: null,
  notes: null,
  custom_fields: {},
  has_face: true,
  identities_count: 1,
  is_blacklisted: false,
  processing_restricted: false,
  restricted_at: null,
  restricted_by: null,
  restriction_reason: null,
  erased_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const PROFILES = [
  { ...base, id: ANNA, code: 'PROFILE-00001', profile_type: 'employee', first_name: 'Anna', last_name: 'Petrova' },
  {
    ...base,
    id: RESTRICTED,
    code: 'PROFILE-00002',
    profile_type: 'contractor',
    first_name: 'Ivan',
    last_name: 'Sokolov',
    processing_restricted: true,
    restricted_at: '2026-10-20T09:00:00Z',
    restriction_reason: 'Accuracy of the data contested',
  },
  {
    ...base,
    id: ERASED,
    code: 'PROFILE-00003',
    profile_type: 'visitor',
    first_name: 'Erased',
    last_name: 'Person',
    company_id: null,
    processing_restricted: true,
    restricted_at: '2026-10-01T09:00:00Z',
    restriction_reason: 'dsr:DSR-00004',
    erased_at: '2026-10-02T09:00:00Z',
  },
];

const COMPANY = {
  id: AURORA,
  name: 'Aurora Analytics',
  kind: 'tenant',
  status: 'active',
  suite: '1201',
  contact_email: null,
  contact_phone: null,
  cost_center: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const STATS = {
  visits_last_30d: 18,
  avg_dwell_minutes: 452.25,
  after_hours_visits_30d: 2,
  last_seen_at: '2026-10-21T17:02:00Z',
  as_of: '2026-10-22T06:00:00Z',
  top_area: { name: 'Floor 12' },
};

interface GraphqlBody {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
}

const bodies = (): GraphqlBody[] =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).includes('graphql'))
    .map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody);

const mutations = (): GraphqlBody[] =>
  bodies().filter((body) => body.query.trimStart().startsWith('mutation'));

async function serve(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query, variables } = JSON.parse(String(init?.body)) as GraphqlBody;
  if (query.trimStart().startsWith('mutation')) return hasuraResponse({ data: { item: PROFILES[0] } });
  if (query.includes('profile_activity_stats')) {
    return hasuraResponse({ data: { profile_activity_stats: variables?.profile === ANNA ? [STATS] : [] } });
  }
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 1 } } } });
  if (query.includes('profiles_by_pk')) {
    return hasuraResponse({ data: { item: PROFILES.find((p) => p.id === variables?.id) ?? null } });
  }
  if (query.includes('companies_by_pk')) return hasuraResponse({ data: { item: COMPANY } });
  if (/\bitems: profiles\(/.test(query)) {
    const text = JSON.stringify(variables ?? {});
    return hasuraResponse({ data: { items: PROFILES.filter((p) => !text.includes(AURORA) || p.company_id === AURORA) } });
  }
  if (/\bitems: companies\(/.test(query)) return hasuraResponse({ data: { items: [COMPANY] } });
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

describe('profile types', () => {
  it('should ask for the type before the create form', async () => {
    renderAt('/profiles/create');
    for (const label of ['Employee', 'Visitor', 'Contractor', 'VIP']) {
      expect(await screen.findByText(label)).toBeDefined();
    }
    expect(screen.queryByRole('textbox', { name: /^First name/ })).toBeNull();
  });

  it('should leave the employment fields off a visitor and keep them on an employee', async () => {
    renderAt('/profiles/create?type=visitor');
    expect(await screen.findByRole('textbox', { name: /^First name/ })).toBeDefined();
    expect(screen.queryByRole('textbox', { name: /^Employee ID/ })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /^Department/ })).toBeNull();
    cleanup();
    renderAt('/profiles/create?type=employee');
    expect(await screen.findByRole('textbox', { name: /^Employee ID/ })).toBeDefined();
    expect(screen.getByRole('textbox', { name: /^Job title/ })).toBeDefined();
  });

  it('should refuse an end date before the start date before any request', async () => {
    renderAt('/profiles/create?type=visitor');
    fireEvent.change(await screen.findByRole('textbox', { name: /^First name/ }), { target: { value: 'Olga' } });
    fireEvent.change(screen.getByRole('textbox', { name: /^Last name/ }), { target: { value: 'Visitor' } });
    fireEvent.change(screen.getByLabelText(/^Start date/), { target: { value: '2026-10-22' } });
    fireEvent.change(screen.getByLabelText(/^End date/), { target: { value: '2026-10-21' } });
    fireEvent.click(screen.getByRole('button', { name: /Create|Save/ }));
    expect(await screen.findByText('The end date cannot be before the start date.')).toBeDefined();
    expect(mutations()).toHaveLength(0);

    fireEvent.change(screen.getByLabelText(/^End date/), { target: { value: '2026-10-23' } });
    fireEvent.click(screen.getByRole('button', { name: /Create|Save/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    expect(mutations()[0]?.variables?.object).toMatchObject({
      profile_type: 'visitor',
      first_name: 'Olga',
      start_date: '2026-10-22',
      end_date: '2026-10-23',
      status: 'active',
      access_level: 'basic',
    });
  });
});

describe('profile page', () => {
  it('should show no notice on an ordinary profile and offer no Delete', async () => {
    renderAt(`/profiles/${ANNA}`);
    expect(await screen.findByText('AUR-001')).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Processing restricted' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Erased' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull();
  });

  it('should say a profile’s processing is restricted, with the reason', async () => {
    renderAt(`/profiles/${RESTRICTED}`);
    expect(await screen.findByText('Accuracy of the data contested')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Processing restricted' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Erased' })).toBeNull();
  });

  it('should say an erased profile is a tombstone', async () => {
    renderAt(`/profiles/${ERASED}`);
    expect(await screen.findByRole('heading', { name: 'Erased' })).toBeDefined();
    expect(screen.getByText(/This profile is a tombstone/)).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Processing restricted' })).toBeDefined();
  });

  it('should show the last 30 days on the Activity tab', async () => {
    renderAt(`/profiles/${ANNA}?sections=activity`);
    expect(await screen.findByText('Floor 12')).toBeDefined();
    expect(screen.getByText('Visits in 30 days')).toBeDefined();
    expect(screen.getByText('18')).toBeDefined();
  });

  it('should say when no activity was computed yet', async () => {
    renderAt(`/profiles/${RESTRICTED}?sections=activity`);
    expect(await screen.findByText(/No activity computed yet/)).toBeDefined();
  });
});

describe('company people', () => {
  it('should list the company’s profiles on its People tab', async () => {
    renderAt(`/companies/${AURORA}?sections=people`);
    expect(await screen.findByRole('row', { name: /Petrova/ })).toBeDefined();
    expect(screen.getByRole('row', { name: /Sokolov/ })).toBeDefined();
    expect(screen.queryByRole('row', { name: /Erased/ })).toBeNull();
    const read = bodies().find((body) => /\bitems: profiles\(/.test(body.query));
    expect(JSON.stringify(read?.variables)).toContain(AURORA);
  });

  it('should start a profile in the company from its People tab', async () => {
    renderAt(`/companies/${AURORA}?sections=people`);
    await screen.findByRole('row', { name: /Petrova/ });
    fireEvent.click(await screen.findByRole('button', { name: /Create/ }));
    fireEvent.click(await screen.findByText('Visitor'));
    fireEvent.change(await screen.findByRole('textbox', { name: /^First name/ }), { target: { value: 'Olga' } });
    fireEvent.change(screen.getByRole('textbox', { name: /^Last name/ }), { target: { value: 'Guest' } });
    fireEvent.click(screen.getByRole('button', { name: /^(Create|Save)/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    expect(mutations()[0]?.variables?.object).toMatchObject({ profile_type: 'visitor', company_id: AURORA });
  });
});
