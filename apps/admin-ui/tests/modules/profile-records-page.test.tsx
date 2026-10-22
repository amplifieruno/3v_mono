// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * Documents, consent, restriction and duplicates on screen: a sensitive document opens through
 * `open_file` on every click, so an expired link is never reused (Review Focus 4); an erased
 * profile's edit form and actions are disabled with the reason (Review Focus 3); an upload goes
 * through the action only; a duplicate pair is compared side by side and the merge says what moves.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const ANNA = '33333333-3333-4333-8333-000000000001';
const IVAN = '33333333-3333-4333-8333-000000000002';
const ERASED = '33333333-3333-4333-8333-000000000003';
const PAIR = '44444444-4444-4444-8444-000000000001';
const FILE = '55555555-5555-4555-8555-000000000001';

const base = {
  status: 'active',
  email: null,
  phone: null,
  company_id: null,
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
  { ...base, id: ANNA, code: 'PROFILE-00001', profile_type: 'employee', first_name: 'Anna', last_name: 'Petrova', full_name: 'Anna Petrova' },
  { ...base, id: IVAN, code: 'PROFILE-00002', profile_type: 'employee', first_name: 'Anna', last_name: 'Petrova', full_name: 'Anna Petrova', email: 'anna@aurora.test' },
  {
    ...base,
    id: ERASED,
    code: 'PROFILE-00003',
    profile_type: 'visitor',
    first_name: 'Erased',
    last_name: 'Person',
    processing_restricted: true,
    restricted_at: '2026-10-01T09:00:00Z',
    restriction_reason: 'dsr:DSR-00004',
    erased_at: '2026-10-02T09:00:00Z',
  },
];

const DOCUMENT = {
  id: 'dddddddd-dddd-4ddd-8ddd-000000000001',
  profile_id: ANNA,
  title: 'Passport 2031',
  kind: 'id_card',
  file_id: FILE,
  version: 1,
  valid_until: '2031-05-01',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};

const PAIR_ROW = {
  id: PAIR,
  profile_a_id: ANNA,
  profile_b_id: IVAN,
  similarity: 0.92,
  reasons: ['name'],
  status: 'open',
  detected_at: '2026-10-20T00:00:00Z',
  created_at: '2026-10-20T00:00:00Z',
  updated_at: '2026-10-20T00:00:00Z',
};

const pairProfile = (p: (typeof PROFILES)[number], identities: number, documents: number) => ({
  ...p,
  company: null,
  profile_documents_aggregate: { aggregate: { count: documents } },
  consent_records_aggregate: { aggregate: { count: 2 } },
  identities_count: identities,
});

interface GraphqlBody {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
}

const bodies = (): GraphqlBody[] =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).includes('graphql'))
    .map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody);

const mutations = (name: string): GraphqlBody[] =>
  bodies().filter((body) => body.query.trimStart().startsWith('mutation') && body.query.includes(name));

let opened = 0;

async function serve(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!String(input).includes('graphql')) return new Response('not here', { status: 404 });
  const { query, variables } = JSON.parse(String(init?.body)) as GraphqlBody;
  if (query.includes('open_file')) {
    opened += 1;
    return hasuraResponse({
      data: { open_file: { url: `https://files.test/doc?sig=${opened}`, expires_at: '2026-10-22T10:00:00Z' } },
    });
  }
  if (query.includes('upload_profile_document')) {
    return hasuraResponse({ data: { upload_profile_document: { document_id: DOCUMENT.id, file_id: FILE } } });
  }
  if (query.includes('ProfilePair')) {
    return hasuraResponse({
      data: { first: [pairProfile(PROFILES[0]!, 2, 1)], second: [pairProfile(PROFILES[1]!, 0, 3)] },
    });
  }
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 1 } } } });
  if (query.includes('profiles_by_pk')) {
    return hasuraResponse({ data: { item: PROFILES.find((p) => p.id === variables?.id) ?? null } });
  }
  if (query.includes('profile_duplicate_candidates_by_pk')) return hasuraResponse({ data: { item: PAIR_ROW } });
  if (/\bitems: profile_documents\(/.test(query)) return hasuraResponse({ data: { items: [DOCUMENT] } });
  if (/\bitems: profiles\(/.test(query)) return hasuraResponse({ data: { items: PROFILES } });
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
  opened = 0;
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(serve));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('profile documents', () => {
  it('should ask open_file for a new link on every opening, never reusing an expired one', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderAt(`/profiles/${ANNA}?sections=documents`);
    const row = await screen.findByRole('row', { name: /Passport 2031/ });
    fireEvent.click(within(row).getByRole('button', { name: /Open file/ }));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(open.mock.calls[0]?.[0]).toBe('https://files.test/doc?sig=1');
    // Later, after that link expired: the same button asks again and opens the new link.
    fireEvent.click(within(row).getByRole('button', { name: /Open file/ }));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(2));
    expect(open.mock.calls[1]?.[0]).toBe('https://files.test/doc?sig=2');
    expect(mutations('open_file').map((m) => m.variables)).toEqual([{ file_id: FILE }, { file_id: FILE }]);
  });

  it('should upload a document through the action only, with the file as base64', async () => {
    renderAt(`/profiles/${ANNA}`);
    await screen.findAllByRole('heading', { name: /Anna Petrova/ });
    fireEvent.keyDown(screen.getAllByRole('button', { name: 'More' })[0]!, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Upload document/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(await within(dialog).findByRole('textbox', { name: /^Title/ }), { target: { value: 'Passport' } });
    const file = new File(['%PDF'], 'passport.pdf', { type: 'application/pdf' });
    fireEvent.change(await within(dialog).findByLabelText(/^File/), { target: { files: [file] } });
    expect(await within(dialog).findByText('passport.pdf')).toBeDefined();
    fireEvent.click(within(dialog).getByRole('button', { name: /^Upload document$/ }));
    await waitFor(() => expect(mutations('upload_profile_document')).toHaveLength(1));
    expect(mutations('upload_profile_document')[0]?.variables).toMatchObject({
      profile: ANNA,
      kind: 'other',
      title: 'Passport',
      fileName: 'passport.pdf',
      mimeType: 'application/pdf',
      content: btoa('%PDF'),
    });
    // Nothing went to the file storage from the browser.
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/files'))).toBe(false);
  });

  it('should refuse a file of another type or over 10 MB before reading it', async () => {
    renderAt(`/profiles/${ANNA}`);
    await screen.findAllByRole('heading', { name: /Anna Petrova/ });
    fireEvent.keyDown(screen.getAllByRole('button', { name: 'More' })[0]!, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Upload document/ }));
    const dialog = await screen.findByRole('dialog');
    const file = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' });
    fireEvent.change(await within(dialog).findByLabelText(/^File/), { target: { files: [file] } });
    expect(await within(dialog).findByText('This file type is not accepted here.')).toBeDefined();
    const large = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'scan.pdf', { type: 'application/pdf' });
    fireEvent.change(await within(dialog).findByLabelText(/^File/), { target: { files: [large] } });
    expect(await within(dialog).findByText(/The file is larger than 10/)).toBeDefined();
    expect(within(dialog).queryByText('scan.pdf')).toBeNull();
  });
});

describe('profile page', () => {
  it('should show “Face linked” once, in the header', async () => {
    renderAt(`/profiles/${ANNA}`);
    await screen.findAllByRole('heading', { name: /Anna Petrova/ });
    await screen.findByText('Face linked');
    expect(screen.getAllByText('Face linked')).toHaveLength(1);
  });
});

describe('erased profile', () => {
  it('should disable the edit form’s fields with the reason', async () => {
    renderAt(`/profiles/${ERASED}/edit`);
    const reasons = await screen.findAllByText(/the profile is a tombstone and cannot be changed/);
    // Every field of the form is locked with the reason: none is an input.
    expect(reasons.length).toBeGreaterThanOrEqual(10);
    expect(screen.getByText('Erased', { selector: 'dd, div, span' })).toBeDefined();
    expect(screen.queryByRole('textbox', { name: /^First name/ })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /^Last name/ })).toBeNull();
  });

  it('should show Edit disabled on the page', async () => {
    renderAt(`/profiles/${ERASED}`);
    await screen.findByRole('heading', { name: 'Erased' });
    const edit = await screen.findByRole('button', { name: /^Edit/ });
    expect(edit.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('profile duplicates', () => {
  it('should compare the pair side by side and mark what differs', async () => {
    renderAt(`/profile-duplicates/${PAIR}`);
    const table = await screen.findByTestId('profile-compare');
    expect(within(table).getByText(/PROFILE-00001/)).toBeDefined();
    expect(within(table).getByText(/PROFILE-00002/)).toBeDefined();
    const email = within(table).getByRole('row', { name: /Email/ });
    expect(email.getAttribute('data-differs')).toBe('true');
    expect(within(table).getByRole('row', { name: /^Name/ }).getAttribute('data-differs')).toBeNull();
  });

  it('should say what the merge moves for the chosen side', async () => {
    renderAt(`/profile-duplicates/${PAIR}`);
    await screen.findByTestId('profile-compare');
    fireEvent.click(await screen.findByRole('button', { name: /^Merge profiles$/ }));
    const dialog = await screen.findByRole('dialog');
    const moves = await within(dialog).findByTestId('profile-compare-moves');
    expect(moves.textContent).toContain('PROFILE-00002 moves 0 identities, 3 documents and 2 consents to PROFILE-00001');
    // The review step says it again (it reads the pair from the flow's values, G35).
    fireEvent.click(within(dialog).getByRole('button', { name: /^Merge profiles$/ }));
    await within(dialog).findByRole('button', { name: /^Back$/ });
    const review = await within(dialog).findByTestId('profile-compare-moves');
    expect(review.textContent).toContain('PROFILE-00002 moves 0 identities');
  });
});
