// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * Visit screens: the steps a visit's page offers by status (no Check in on a cancelled or
 * checked-out visit, Review Focus 5) and Edit disabled once it left scheduled; the visitor picker
 * offering visitor profiles only; the window refused before any request; the Visits tabs of a
 * visitor (their visits), a host (the visits they host) and a company.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const AURORA = '22222222-2222-4222-8222-000000000001';
const HOST = '33333333-3333-4333-8333-000000000001';
const GUEST = '33333333-3333-4333-8333-000000000002';
const SCHEDULED = '99999999-9999-4999-8999-000000000001';
const CANCELLED = '99999999-9999-4999-8999-000000000002';
const CHECKED_OUT = '99999999-9999-4999-8999-000000000003';

const person = {
  status: 'active',
  email: null,
  phone: null,
  company_id: AURORA,
  employee_id: null,
  department: null,
  job_title: null,
  work_schedule_id: null,
  access_level: 'basic',
  start_date: null,
  end_date: null,
  avatar_file_id: null,
  external_id: null,
  notes: null,
  custom_fields: {},
  has_face: false,
  identities_count: 0,
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
  { ...person, id: HOST, code: 'PROFILE-00001', profile_type: 'employee', first_name: 'Anna', last_name: 'Petrova', full_name: 'Anna Petrova' },
  { ...person, id: GUEST, code: 'PROFILE-00002', profile_type: 'visitor', first_name: 'Olga', last_name: 'Guestova', full_name: 'Olga Guestova' },
];

const visitRow = {
  visitor_profile_id: GUEST,
  host_profile_id: HOST,
  company_id: AURORA,
  facility_id: null,
  purpose: 'Interview',
  expected_start: '2026-10-22T09:00:00Z',
  expected_end: '2026-10-22T11:00:00Z',
  badge_number: null,
  checked_in_at: null,
  checked_out_at: null,
  cancellation_reason: null,
  created_at: '2026-10-20T00:00:00Z',
  updated_at: '2026-10-20T00:00:00Z',
};

const VISITS = [
  { ...visitRow, id: SCHEDULED, code: 'VISIT-00001', status: 'scheduled' },
  { ...visitRow, id: CANCELLED, code: 'VISIT-00002', status: 'cancelled', cancellation_reason: 'Host is ill' },
  {
    ...visitRow,
    id: CHECKED_OUT,
    code: 'VISIT-00003',
    status: 'checked_out',
    checked_in_at: '2026-10-22T09:05:00Z',
    checked_out_at: '2026-10-22T10:40:00Z',
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

interface GraphqlBody {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
}

const bodies = (): GraphqlBody[] =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).includes('graphql'))
    .map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody);

const mutations = (): GraphqlBody[] => bodies().filter((body) => body.query.trimStart().startsWith('mutation'));

const visitReads = (): GraphqlBody[] => bodies().filter((body) => /\bitems: visits\(/.test(body.query));

async function serve(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query, variables } = JSON.parse(String(init?.body)) as GraphqlBody;
  if (query.trimStart().startsWith('mutation')) return hasuraResponse({ data: { item: VISITS[0] } });
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 1 } } } });
  if (query.includes('visits_by_pk')) {
    return hasuraResponse({ data: { item: VISITS.find((v) => v.id === variables?.id) ?? null } });
  }
  if (query.includes('profiles_by_pk')) {
    return hasuraResponse({ data: { item: PROFILES.find((p) => p.id === variables?.id) ?? null } });
  }
  if (query.includes('companies_by_pk')) return hasuraResponse({ data: { item: COMPANY } });
  if (/\bitems: visits\(/.test(query)) return hasuraResponse({ data: { items: VISITS } });
  if (/\bitems: profiles\(/.test(query)) {
    const text = JSON.stringify(variables ?? {});
    return hasuraResponse({ data: { items: PROFILES.filter((p) => !text.includes('visitor') || p.profile_type === 'visitor') } });
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

describe('visit page', () => {
  it('should offer Check in on a scheduled visit, with Edit', async () => {
    renderAt(`/visits/${SCHEDULED}`);
    expect(await screen.findByRole('button', { name: /^Check in/ })).toBeDefined();
    // An enabled Edit is a link to the edit form.
    expect(await screen.findByRole('link', { name: /^Edit/ })).toBeDefined();
  });

  it('should not offer Check in on a cancelled visit, show why it was cancelled and disable Edit (Review Focus 5)', async () => {
    renderAt(`/visits/${CANCELLED}`);
    expect(await screen.findByText('Host is ill')).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Check in/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Check out/ })).toBeNull();
    const edit = await screen.findByRole('button', { name: /^Edit/ });
    expect(edit.getAttribute('aria-disabled')).toBe('true');
  });

  it('should not offer Check in or Check out on a checked-out visit (Review Focus 5)', async () => {
    renderAt(`/visits/${CHECKED_OUT}`);
    await screen.findAllByRole('heading', { name: /VISIT-00003/ });
    expect(screen.queryByRole('button', { name: /^Check in/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Check out/ })).toBeNull();
    expect(screen.queryByText('Host is ill')).toBeNull();
  });
});

describe('scheduling a visit', () => {
  it('should offer visitor profiles only as the visitor', async () => {
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.scrollIntoView ??= () => undefined;
    renderAt('/visits/create');
    fireEvent.click(await screen.findByRole('combobox', { name: /^Visitor/ }));
    expect(await screen.findByRole('option', { name: /Guestova/ })).toBeDefined();
    expect(screen.queryByRole('option', { name: /Petrova/ })).toBeNull();
    const read = bodies().find((body) => /\bitems: profiles\(/.test(body.query));
    expect(JSON.stringify(read?.variables)).toContain('visitor');
  });

  it('should refuse a visit that does not end after it starts, before any request', async () => {
    renderAt('/visits/create');
    fireEvent.change(await screen.findByLabelText(/^Expected from/), { target: { value: '2026-10-22T11:00' } });
    fireEvent.change(screen.getByLabelText(/^Expected until/), { target: { value: '2026-10-22T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: /^(Create|Save)/ }));
    expect(await screen.findByText('The visit must end after it starts.')).toBeDefined();
    expect(mutations()).toHaveLength(0);
  });

  it('should take the expected window with its time of day and send it as instants', async () => {
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.scrollIntoView ??= () => undefined;
    renderAt(`/visits/create?prefill.visitor_profile_id=${GUEST}`);
    const from = await screen.findByLabelText(/^Expected from/);
    expect(from.getAttribute('type')).toBe('datetime-local');
    fireEvent.change(from, { target: { value: '2026-10-22T09:30' } });
    fireEvent.change(screen.getByLabelText(/^Expected until/), { target: { value: '2026-10-22T11:00' } });
    fireEvent.click(screen.getByRole('button', { name: /^(Create|Save)/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    expect(mutations()[0]?.variables?.object).toMatchObject({
      visitor_profile_id: GUEST,
      expected_start: new Date('2026-10-22T09:30').toISOString(),
      expected_end: new Date('2026-10-22T11:00').toISOString(),
    });
  });
});

describe('visits tabs', () => {
  it('should list a visitor’s own visits on their profile', async () => {
    renderAt(`/profiles/${GUEST}?sections=visits`);
    expect(await screen.findByRole('row', { name: /VISIT-00001/ })).toBeDefined();
    await waitFor(() => expect(visitReads().length).toBeGreaterThan(0));
    const where = JSON.stringify(visitReads()[0]?.variables);
    expect(where).toContain('visitor_profile_id');
    expect(where).toContain(GUEST);
    expect(screen.queryByRole('heading', { name: 'Hosted visits' })).toBeNull();
  });

  it('should list the visits a host hosts on their profile', async () => {
    renderAt(`/profiles/${HOST}?sections=visits`);
    expect(await screen.findByRole('heading', { name: 'Hosted visits' })).toBeDefined();
    await screen.findByRole('row', { name: /VISIT-00001/ });
    const where = JSON.stringify(visitReads()[0]?.variables);
    expect(where).toContain('host_profile_id');
    expect(where).toContain(HOST);
  });

  it('should list the company’s visits on its Visits tab', async () => {
    renderAt(`/companies/${AURORA}?sections=visits`);
    const row = await screen.findByRole('row', { name: /VISIT-00002/ });
    expect(within(row).getByText('Cancelled')).toBeDefined();
    const where = JSON.stringify(visitReads()[0]?.variables);
    expect(where).toContain('company_id');
    expect(where).toContain(AURORA);
  });
});
