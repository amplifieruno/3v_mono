// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { BASELINE_RESET_TEXT } from '../../src/modules/search/saved-search-flows';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * Saved searches on screen over a fake Hasura: the page shows the filters in words (enum labels,
 * the company's name), says when there is no alert baseline, and shows the last scheduled run's
 * results; a saved search shared by someone else is read only, with the reasons, without its
 * photo or runs; the edit form says that saving a changed search resets the baseline (Review
 * Focus 5) and sends the search only when it changed; Run now sends the stored definition.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const SAVED = '55555555-5555-4555-8555-000000000001';
const PHOTO = '77777777-7777-4777-8777-000000000001';
const COMPANY = '22222222-2222-4222-8222-000000000001';
const REQUEST = '66666666-6666-4666-8666-000000000001';

interface GraphqlBody {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
}

const row = (overrides: Record<string, unknown> = {}) => ({
  id: SAVED,
  name: 'Night visitors',
  description: 'Visitors of Acme seen at night',
  search_type: 'combined',
  image_file_id: PHOTO,
  filters: { status: ['verified', 'unverified'], company_id: COMPANY, age_min: 20, age_max: 40 },
  threshold: 0.6,
  max_results: 20,
  fuzzy: false,
  is_shared: true,
  schedule_cron: '0 7 * * 1',
  alert_on_match: true,
  owner_id: 'user-1',
  next_run_at: '2026-10-26T07:00:00Z',
  last_run_at: null,
  last_run_status: null,
  owner_last_error: null,
  last_search_request_id: null,
  created_at: '2026-10-20T09:00:00Z',
  updated_at: '2026-10-20T09:00:00Z',
  ...overrides,
});

let saved: Record<string, unknown>;

const bodies = (): GraphqlBody[] =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).includes('graphql'))
    .map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody);

const sent = (name: string): GraphqlBody | undefined => bodies().find((body) => body.query.includes(name));

const run = {
  id: REQUEST,
  search_type: 'combined',
  status: 'completed',
  error: null,
  face_count: 1,
  results_count: 0,
  top_confidence: null,
  duration_ms: 80,
  threshold: 0.6,
  fuzzy: false,
  max_results: 20,
  image_file_id: PHOTO,
  created_at: '2026-10-21T07:00:00Z',
  results: [],
};

async function serve(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  if (url.endsWith('/v1/files') && init?.method === 'POST') return hasuraResponse({ processedFiles: [{ id: PHOTO }] });
  if (url.includes('/presignedurl')) return hasuraResponse({ url: `https://files.test/${url.split('/').at(-2)}`, expiration: 60 });
  if (!url.includes('graphql')) return new Response('not here', { status: 404 });
  const { query } = JSON.parse(String(init?.body)) as GraphqlBody;
  if (query.includes('query SearchDefaults')) return hasuraResponse({ data: { organization_settings: [{ recognition_threshold: 0.4 }] } });
  if (query.includes('query SearchFilterNames')) return hasuraResponse({ data: { companies: [{ id: COMPANY, name: 'Acme Corp' }], facilities: [] } });
  if (query.includes('query SavedSearchForm')) return hasuraResponse({ data: { saved_searches_by_pk: saved } });
  if (query.includes('mutation CreateSavedSearch')) return hasuraResponse({ data: { insert_saved_searches_one: { id: SAVED, last_search_request_id: null } } });
  if (query.includes('mutation UpdateSavedSearch')) return hasuraResponse({ data: { update_saved_searches_by_pk: { id: SAVED, last_search_request_id: null } } });
  if (query.includes('search_faces(')) {
    return hasuraResponse({
      data: { search_faces: { search_request_id: REQUEST, status: 'completed', results_count: 0, top_confidence: null, duration_ms: 80, face_count: 1, error: null } },
    });
  }
  if (query.includes('query SearchRun')) return hasuraResponse({ data: { search_requests_by_pk: run } });
  if (query.includes('search_requests_by_pk')) return hasuraResponse({ data: { item: { ...run, filters: {}, saved_search_id: null } } });
  if (query.includes('saved_searches_by_pk')) return hasuraResponse({ data: { item: saved } });
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 0 } } } });
  if (/\bitems: saved_searches\(/.test(query)) return hasuraResponse({ data: { items: [saved] } });
  return hasuraResponse({ data: { items: [] } });
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ConsoleApp auth={fakeAdminAuth(NOVA, 'Nova Tower Business Center')} />
    </MemoryRouter>,
  );

const main = async () => within(await screen.findByRole('main', {}, { timeout: 8000 }));

configure({ asyncUtilTimeout: 5000 });

beforeAll(() => {
  installDomShims();
  Element.prototype.scrollIntoView ??= () => undefined;
  Element.prototype.hasPointerCapture ??= () => false;
});

beforeEach(() => {
  localStorage.clear();
  saved = row();
  vi.stubGlobal('fetch', vi.fn(serve));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('saved search page', () => {
  it('should show the filters in words, with the company’s name and the enum labels', async () => {
    renderAt(`/saved-searches/${SAVED}`);
    expect(await (await main()).findByText('Acme Corp')).toBeDefined();
    const filters = screen.getByText('Acme Corp').closest('ul') as HTMLElement;
    expect(within(filters).getByText(/Verified, Unverified/u)).toBeDefined();
    expect(within(filters).getByText(/20 to 40/u)).toBeDefined();
    expect(filters.textContent).not.toContain(COMPANY);
  });

  it('should fall back to the unknown company when the names cannot be read', async () => {
    const answer = vi.mocked(fetch).getMockImplementation() ?? serve;
    vi.mocked(fetch).mockImplementation(async (input, init) =>
      String(init?.body ?? '').includes('query SearchFilterNames') ? new Response('down', { status: 500 }) : answer(input, init),
    );
    renderAt(`/saved-searches/${SAVED}`);
    expect(await (await main()).findByText(/a company that no longer exists/u, {}, { timeout: 8000 })).toBeDefined();
  });

  it('should say there is no alert baseline yet while alerts are on (Review Focus 5)', async () => {
    renderAt(`/saved-searches/${SAVED}`);
    expect(await (await main()).findByText('No alert baseline yet')).toBeDefined();
    expect(screen.queryByText('Last scheduled run')).toBeNull();
  });

  it('should not speak of a baseline when the search has no schedule', async () => {
    saved = row({ schedule_cron: null });
    renderAt(`/saved-searches/${SAVED}`);
    expect(await (await main()).findByText('What it searches')).toBeDefined();
    expect(screen.queryByText('No alert baseline yet')).toBeNull();
  });

  it('should show the last scheduled run’s results with a link to it in the history', async () => {
    saved = row({ last_search_request_id: REQUEST, last_run_at: '2026-10-21T07:00:00Z', last_run_status: 'completed' });
    renderAt(`/saved-searches/${SAVED}`);
    expect(await (await main()).findByText('Last scheduled run')).toBeDefined();
    expect((await screen.findByTestId('search-outcome')).getAttribute('data-outcome')).toBe('none');
    expect(screen.getByRole('link', { name: 'Open in search history' }).getAttribute('href')).toBe(`/search-history/${REQUEST}`);
    expect(screen.queryByText('No alert baseline yet')).toBeNull();
  });

  it('should run the stored definition with Run now and open the run', async () => {
    renderAt(`/saved-searches/${SAVED}`);
    fireEvent.click(await (await main()).findByRole('button', { name: /^Run now/u }));
    await waitFor(() => expect(sent('search_faces(')).toBeDefined());
    expect(sent('search_faces(')?.variables).toEqual({
      type: 'combined',
      image: PHOTO,
      filters: saved.filters,
      threshold: 0.6,
      max: 20,
      fuzzy: false,
    });
    expect(await screen.findByTestId('search-outcome')).toBeDefined();
  });
});

describe('saved search shared by someone else', () => {
  beforeEach(() => {
    saved = row({ owner_id: 'user-2', image_file_id: PHOTO });
  });

  it('should offer Edit and Run now disabled, with the reasons, and hide the photo and the baseline', async () => {
    renderAt(`/saved-searches/${SAVED}`);
    await (await main()).findByText('Acme Corp');
    const edit = await (await main()).findByRole('button', { name: /^Edit/u });
    expect(edit.getAttribute('aria-disabled')).toBe('true');
    const runNow = (await main()).getByRole('button', { name: /^Run now/u });
    expect(runNow.getAttribute('aria-disabled')).toBe('true');
    fireEvent.focus(runNow);
    expect((await screen.findAllByText(/only the owner can run this face search/u)).length).toBeGreaterThan(0);
    expect(screen.queryByText('Photo')).toBeNull();
    expect(screen.queryByText('No alert baseline yet')).toBeNull();
    expect(screen.queryByText('Scheduled runs')).toBeNull();
  });

  it('should let an attribute search be run by another member', async () => {
    saved = row({ owner_id: 'user-2', search_type: 'attribute', image_file_id: null, threshold: null });
    renderAt(`/saved-searches/${SAVED}`);
    const runNow = await (await main()).findByRole('button', { name: /^Run now/u });
    await waitFor(() => expect(runNow.getAttribute('aria-disabled')).not.toBe('true'));
  });
});

describe('saved search edit form', () => {
  const openEdit = async () => {
    renderAt(`/saved-searches/${SAVED}`);
    fireEvent.click(await (await main()).findByRole('button', { name: /^Edit/u }));
    const dialog = await screen.findByRole('dialog');
    const name = (await within(dialog).findByLabelText(/^Name/u)) as HTMLInputElement;
    await waitFor(() => expect(name.value).toBe('Night visitors'));
    return dialog;
  };
  /** The dialog's submit (named after the flow, as the page's button behind it). */
  const save = (dialog: HTMLElement) => fireEvent.click(within(dialog).getAllByRole('button', { name: 'Edit' }).at(-1) as HTMLElement);

  it('should say that saving a changed search resets the alert baseline, and send the search', async () => {
    const dialog = await openEdit();
    expect(within(dialog).queryByText(BASELINE_RESET_TEXT)).toBeNull();
    fireEvent.change(within(dialog).getByLabelText(/^Threshold/u), { target: { value: '0.7' } });
    save(dialog);
    // The flow's last step says what saving does; nothing is sent before it is confirmed.
    expect(await within(dialog).findByText(BASELINE_RESET_TEXT)).toBeDefined();
    expect(sent('mutation UpdateSavedSearch')).toBeUndefined();
    save(dialog);
    await waitFor(() => expect(sent('mutation UpdateSavedSearch')).toBeDefined());
    expect(sent('mutation UpdateSavedSearch')?.variables).toEqual({
      id: SAVED,
      set: {
        name: 'Night visitors',
        description: 'Visitors of Acme seen at night',
        is_shared: true,
        schedule_cron: '0 7 * * 1',
        alert_on_match: true,
        search_type: 'combined',
        image_file_id: PHOTO,
        // The form picks one status (G64): a changed search is sent as the form holds it.
        filters: { status: ['verified'], company_id: COMPANY, age_min: 20, age_max: 40 },
        threshold: 0.7,
        max_results: 20,
        fuzzy: false,
      },
    });
  });

  it('should keep the search (and its baseline) when only the name changes', async () => {
    const dialog = await openEdit();
    fireEvent.change(within(dialog).getByLabelText(/^Name/u), { target: { value: 'Night visitors (Acme)' } });
    save(dialog);
    await waitFor(() => expect(sent('mutation UpdateSavedSearch')).toBeDefined());
    expect(within(dialog).queryByText(BASELINE_RESET_TEXT)).toBeNull();
    expect(sent('mutation UpdateSavedSearch')?.variables).toEqual({
      id: SAVED,
      set: { name: 'Night visitors (Acme)', description: 'Visitors of Acme seen at night', is_shared: true, schedule_cron: '0 7 * * 1', alert_on_match: true },
    });
  });
});

describe('new saved search', () => {
  it('should save the search from the Search page’s form with its name, starting at the default threshold', async () => {
    renderAt('/saved-searches');
    fireEvent.click(await (await main()).findByRole('button', { name: /^New saved search/u }));
    const dialog = await screen.findByRole('dialog');
    const threshold = (await within(dialog).findByLabelText(/^Threshold/u)) as HTMLInputElement;
    await waitFor(() => expect(threshold.value).toBe('0.6'));
    fireEvent.change(within(dialog).getByLabelText(/^Name/u), { target: { value: 'Lobby faces' } });
    fireEvent.change(within(dialog).getByLabelText(/^Photo/u), { target: { files: [new File(['jpeg'], 'face.jpg', { type: 'image/jpeg' })] } });
    await within(dialog).findByRole('img', { name: 'Photo 1' });
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'New saved search' }).at(-1) as HTMLElement);
    await waitFor(() => expect(sent('mutation CreateSavedSearch')).toBeDefined());
    expect(sent('mutation CreateSavedSearch')?.variables).toEqual({
      object: {
        name: 'Lobby faces',
        description: null,
        is_shared: false,
        schedule_cron: null,
        alert_on_match: false,
        search_type: 'facial',
        image_file_id: PHOTO,
        filters: {},
        threshold: 0.6,
        max_results: 20,
        fuzzy: false,
      },
    });
  });
});
