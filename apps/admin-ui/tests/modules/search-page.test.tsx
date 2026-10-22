// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * Search on screen over a fake Hasura: the Search page opens with the organization's default
 * threshold (1 − its recognition threshold), uploads the photo as an owner-only `search` file and
 * sends `search_faces`; a photo without a face shows that outcome in place of results, and a photo
 * with several faces says the largest was searched (Review Focus 1); results are cards with the
 * identity's photo, code, person, similarity and match type, linking to the identity and profile.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const REQUEST = '66666666-6666-4666-8666-000000000001';
const PHOTO = '77777777-7777-4777-8777-000000000001';
const FACE_A = '88888888-8888-4888-8888-000000000001';
const FACE_B = '88888888-8888-4888-8888-000000000002';
const PROFILE_A = '99999999-9999-4999-8999-000000000001';

interface GraphqlBody {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
}

const run = (overrides: Record<string, unknown> = {}) => ({
  id: REQUEST,
  search_type: 'facial',
  status: 'completed',
  error: null,
  face_count: 1,
  results_count: 2,
  top_confidence: 0.86,
  duration_ms: 120,
  threshold: 0.6,
  fuzzy: true,
  max_results: 20,
  image_file_id: PHOTO,
  created_at: '2026-10-22T09:00:00Z',
  results: [
    {
      id: 'r1',
      rank: 1,
      confidence: 0.86,
      match_type: 'exact',
      identity: { id: FACE_A, code: 'IDENTITY-00012', status: 'verified', primary_photo_file_id: 'f0000000-0000-4000-8000-000000000001' },
      profile: { id: PROFILE_A, full_name: 'Anna Berg', profile_type: 'employee' },
    },
    {
      id: 'r2',
      rank: 2,
      confidence: 0.55,
      match_type: 'fuzzy',
      identity: { id: FACE_B, code: 'IDENTITY-00040', status: 'unverified', primary_photo_file_id: null },
      profile: null,
    },
  ],
  ...overrides,
});

/** What the search reads answer; set per test. */
let searchRun: Record<string, unknown>;
let searchAnswer: Record<string, unknown>;

const bodies = (): GraphqlBody[] =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).includes('graphql'))
    .map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody);

async function serve(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  if (url.endsWith('/v1/files') && init?.method === 'POST') return hasuraResponse({ processedFiles: [{ id: PHOTO }] });
  if (url.includes('/presignedurl')) return hasuraResponse({ url: `https://files.test/${url.split('/').at(-2)}`, expiration: 60 });
  if (!url.includes('graphql')) return new Response('not here', { status: 404 });
  const { query } = JSON.parse(String(init?.body)) as GraphqlBody;
  if (query.includes('query SearchDefaults')) return hasuraResponse({ data: { organization_settings: [{ recognition_threshold: 0.4 }] } });
  if (query.includes('organization_settings_by_pk')) return hasuraResponse({ data: { item: { organization_id: NOVA } } });
  if (query.includes('search_faces(')) return hasuraResponse({ data: { search_faces: searchAnswer } });
  if (query.includes('query SearchRun')) return hasuraResponse({ data: { search_requests_by_pk: searchRun } });
  if (query.includes('search_requests_by_pk')) return hasuraResponse({ data: { item: { ...searchRun, filters: {} } } });
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 0 } } } });
  return hasuraResponse({ data: { items: [] } });
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ConsoleApp auth={fakeAdminAuth(NOVA, 'Nova Tower Business Center')} />
    </MemoryRouter>,
  );

/** The search form's own submit (the sidebar has a "Search" section too). */
const submitButton = (): HTMLElement => {
  return within(screen.getByRole('main')).getByRole('button', { name: /^Search$/ });
};

configure({ asyncUtilTimeout: 5000 });

beforeAll(() => {
  installDomShims();
  Element.prototype.scrollIntoView ??= () => undefined;
  Element.prototype.hasPointerCapture ??= () => false;
});

beforeEach(() => {
  localStorage.clear();
  searchRun = run();
  searchAnswer = { search_request_id: REQUEST, status: 'completed', results_count: 2, top_confidence: 0.86, duration_ms: 120, face_count: 1, error: null };
  vi.stubGlobal('fetch', vi.fn(serve));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('search page', () => {
  it('should start at the organization’s default threshold and send the uploaded photo to search_faces', async () => {
    searchRun = run({ status: 'failed', error: 'no_face', face_count: 0, results_count: 0, top_confidence: null, results: [] });
    searchAnswer = { ...searchAnswer, status: 'failed', results_count: 0, top_confidence: null, face_count: 0, error: 'no_face' };
    renderAt('/search');
    const threshold = (await screen.findByLabelText(/^Threshold/)) as HTMLInputElement;
    await waitFor(() => expect(threshold.value).toBe('0.6'));

    fireEvent.change(await screen.findByLabelText(/^Photo/), { target: { files: [new File(['jpeg'], 'face.jpg', { type: 'image/jpeg' })] } });
    await screen.findByRole('img', { name: 'Photo 1' });
    const upload = vi.mocked(fetch).mock.calls.find(([url, init]) => String(url).endsWith('/v1/files') && init?.method === 'POST');
    expect(String((upload?.[1]?.body as FormData).get('metadata[]'))).toContain('"kind":"search"');

    fireEvent.click(submitButton());
    const outcome = await screen.findByTestId('search-outcome');
    const sent = bodies().find((body) => body.query.includes('search_faces('));
    expect(sent?.variables).toEqual({ type: 'facial', image: PHOTO, filters: {}, threshold: 0.6, max: 20, fuzzy: false });
    // Review Focus 1: the photo's outcome, not an empty result.
    expect(outcome.getAttribute('data-outcome')).toBe('photo');
    expect(outcome.textContent).toContain('No face was found in the photo');
    expect(screen.queryAllByTestId('search-result')).toHaveLength(0);
    expect(screen.getByRole('link', { name: 'Open in search history' }).getAttribute('href')).toBe(`/search-history/${REQUEST}`);
  });

  it('should not send a face search without a photo', async () => {
    renderAt('/search');
    await screen.findByLabelText(/^Threshold/);
    fireEvent.click(submitButton());
    await waitFor(() => expect(screen.getAllByText(/1 to 1 photos|at least|required/i).length).toBeGreaterThan(0));
    expect(bodies().some((body) => body.query.includes('search_faces('))).toBe(false);
  });
});

describe('search request page', () => {
  it('should show each identity found as a card with its photo, person, similarity and match type', async () => {
    renderAt(`/search-history/${REQUEST}`);
    const cards = await screen.findAllByTestId('search-result');
    expect(cards).toHaveLength(2);
    const [first, second] = cards as [HTMLElement, HTMLElement];
    expect(first.getAttribute('data-match-type')).toBe('exact');
    expect(within(first).getByText('Exact')).toBeDefined();
    expect(within(first).getByText('Similarity 86%')).toBeDefined();
    expect(within(first).getByRole('link', { name: 'IDENTITY-00012' }).getAttribute('href')).toBe(`/identities/${FACE_A}`);
    expect(within(first).getByRole('link', { name: 'Anna Berg' }).getAttribute('href')).toBe(`/profiles/${PROFILE_A}`);
    expect(await within(first).findByRole('img', { name: 'Photo of IDENTITY-00012' })).toBeDefined();
    expect(within(second).getByText('Fuzzy')).toBeDefined();
    expect(within(second).getByText('Unknown person')).toBeDefined();
    expect(screen.getByTestId('search-outcome').textContent).toContain('2 identities found, best match first.');
    expect(screen.queryByRole('link', { name: 'Open in search history' })).toBeNull();
  });

  it('should say the largest of several faces was searched, and when nobody matched (Review Focus 1)', async () => {
    searchRun = run({ face_count: 3, results_count: 0, top_confidence: null, results: [] });
    renderAt(`/search-history/${REQUEST}`);
    expect((await screen.findByTestId('search-several-faces')).textContent).toBe('The photo shows 3 faces; the largest one was searched.');
    expect(screen.getByTestId('search-outcome').getAttribute('data-outcome')).toBe('none');
    expect(screen.getByTestId('search-outcome').textContent).toContain('Nobody matched.');
  });

  it('should name a photo too poor to search', async () => {
    searchRun = run({ status: 'failed', error: 'low_quality', face_count: 1, results_count: 0, top_confidence: null, results: [] });
    renderAt(`/search-history/${REQUEST}`);
    const outcome = await screen.findByTestId('search-outcome');
    expect(outcome.getAttribute('role')).toBe('alert');
    expect(outcome.textContent).toContain('too small, blurred, dark or turned away');
  });
});
