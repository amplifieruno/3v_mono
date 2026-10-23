// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * Attempts and the tester on screen over a fake Hasura: "Authenticate a face" sends nothing with
 * fewer than 3 frames, then sends 3 uploaded frames to `authenticate_face` and shows the decision
 * fields the API returns, with links to the attempt and the session (Review Focus 4); a pending
 * partial match offers Approve and Reject, a reviewed one shows the reviewer's note instead
 * (Review Focus 3); the evidence frame opens through the audited `open_file`.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const APP = '22222222-2222-4222-8222-000000000021';
const ATTEMPT = '33333333-3333-4333-8333-000000000001';
const SESSION = '33333333-3333-4333-8333-000000000002';
const EVIDENCE = '33333333-3333-4333-8333-000000000003';
const IDENTITY = '33333333-3333-4333-8333-000000000004';
const FRAMES = ['77777777-7777-4777-8777-000000000001', '77777777-7777-4777-8777-000000000002', '77777777-7777-4777-8777-000000000003'];

interface GraphqlBody {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
}

const attemptRow = (extra: Record<string, unknown> = {}) => ({
  id: ATTEMPT,
  attempted_at: '2026-10-22T09:00:00Z',
  session_id: SESSION,
  application_id: APP,
  attempt_no: 3,
  step: 'recapture',
  mode: 'identification',
  outcome: 'partial_match',
  failure_reason: null,
  attack_outcome: 'passed',
  confidence: 0.571,
  threshold_used: 0.6,
  population_size: 42,
  matched_identity_id: IDENTITY,
  profile_id: null,
  claimed_identity_id: null,
  access_point_id: null,
  latency_ms: 812,
  retrieval_candidates: 20,
  retrieval_hit: null,
  comparison_score: 0.571,
  retrieval_ms: 4,
  comparison_ms: 6,
  model_version: 'w600k_mbf',
  evidence_file_id: EVIDENCE,
  review_status: 'pending',
  reviewed_by: null,
  reviewed_at: null,
  review_note: null,
  device_ref: 'kiosk-1',
  ip: null,
  ...extra,
});

let attempt: Record<string, unknown>;
let uploads = 0;
let sandbox = false;
let uploadKinds: string[] = [];

const bodies = (): GraphqlBody[] =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).includes('graphql'))
    .map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody);

const decision = {
  request_id: 'req-42',
  session_id: SESSION,
  attempt_id: ATTEMPT,
  outcome: 'success',
  authenticated: true,
  confidence: 0.912,
  identity_id: IDENTITY,
  attributes: { display_name: 'Ada Example', segments: ['Employees', 'Night shift'], photo: null },
  attack_outcome: 'passed',
  failure_code: null,
  failure_message: null,
  failure_guidance: null,
  next_step: 'none',
};

async function serve(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  if (url.endsWith('/v1/files') && init?.method === 'POST') {
    uploads += 1;
    const form = init?.body;
    if (form instanceof FormData) uploadKinds.push(String(form.get('metadata[]') ?? form.get('metadata') ?? ''));
    return hasuraResponse({ processedFiles: [{ id: FRAMES[(uploads - 1) % FRAMES.length] }] });
  }
  if (url.includes('/presignedurl')) return hasuraResponse({ url: `https://files.test/${url.split('/').at(-2)}`, expiration: 60 });
  if (!url.includes('graphql')) return new Response('not here', { status: 404 });
  const { query } = JSON.parse(String(init?.body)) as GraphqlBody;
  if (query.includes('authenticate_face(')) return hasuraResponse({ data: { authenticate_face: decision } });
  if (query.includes('open_file(')) return hasuraResponse({ data: { open_file: { url: 'https://files.test/evidence', expires_at: '2030-01-01T00:00:00Z' } } });
  if (query.includes('organization_settings_by_pk')) return hasuraResponse({ data: { item: { organization_id: NOVA } } });
  if (query.includes('client_applications_by_pk')) {
    return hasuraResponse({ data: { item: { id: APP, code: 'APP-00021', name: 'Lobby Kiosk', status: 'active', is_sandbox: sandbox } } });
  }
  if (query.includes('authentication_attempts_by_pk')) return hasuraResponse({ data: { item: attempt } });
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 1 } } } });
  if (/\bitems: client_applications\(/u.test(query)) {
    return hasuraResponse({ data: { items: [{ id: APP, code: 'APP-00021', name: 'Lobby Kiosk', status: 'active' }] } });
  }
  return hasuraResponse({ data: { items: [] } });
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ConsoleApp auth={fakeAdminAuth(NOVA, 'Nova Tower Business Center')} />
    </MemoryRouter>,
  );

const main = (): HTMLElement => screen.getByRole('main');
const sentAuthentications = () => bodies().filter((body) => body.query.includes('authenticate_face('));
const frame = (n: number) => new File([`jpeg-${n}`], `frame-${n}.jpg`, { type: 'image/jpeg' });

configure({ asyncUtilTimeout: 5000 });

beforeAll(() => {
  installDomShims();
  Element.prototype.scrollIntoView ??= () => undefined;
  Element.prototype.hasPointerCapture ??= () => false;
});

beforeEach(() => {
  localStorage.clear();
  attempt = attemptRow();
  uploads = 0;
  sandbox = false;
  uploadKinds = [];
  vi.stubGlobal('fetch', vi.fn(serve));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Authenticate a face (Review Focus 4)', () => {
  it('should refuse fewer than 3 frames, then show the decision the API returns', async () => {
    renderAt('/authenticate-a-face');
    fireEvent.click(await screen.findByRole('combobox', { name: /^Application/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Lobby Kiosk/ }));

    const authenticate = within(main()).getByRole('button', { name: /^Authenticate$/ });
    fireEvent.click(authenticate);
    await waitFor(() => expect(within(main()).getAllByText('This field is required').length).toBeGreaterThan(0));

    fireEvent.change(screen.getByLabelText(/^Frames/), { target: { files: [frame(1), frame(2)] } });
    await screen.findByRole('img', { name: 'Photo 2' });
    fireEvent.click(authenticate);
    await waitFor(() => expect(screen.getAllByText('Add at least 3 photos.').length).toBeGreaterThan(0));
    expect(sentAuthentications()).toHaveLength(0);

    fireEvent.change(screen.getByLabelText(/^Frames/), { target: { files: [frame(3)] } });
    await screen.findByRole('img', { name: 'Photo 3' });
    fireEvent.click(authenticate);

    const view = await screen.findByTestId('auth-decision');
    expect(sentAuthentications().map((body) => body.variables)).toEqual([
      { application: APP, files: FRAMES, mode: 'identification', claimed: null, accessPoint: null, threshold: null },
    ]);
    expect(view.getAttribute('data-outcome')).toBe('success');
    expect(within(view).getByRole('status').textContent).toBe('Authenticated');
    expect(within(view).getByText('Success')).toBeDefined();
    expect(within(view).getByTestId('auth-decision-confidence').textContent).toBe('0.912');
    expect(within(view).getByTestId('auth-decision-attributes').textContent).toContain('Display name: Ada Example');
    expect(within(view).getByTestId('auth-decision-attributes').textContent).toContain('Employees, Night shift');
    expect(within(view).getByTestId('auth-decision-attributes').textContent).toContain('No link: the person has no photo, or it could not be signed.');
    expect(within(view).getByText('Passed')).toBeDefined();
    expect(within(view).getByText('None: the session is closed.')).toBeDefined();
    expect(within(view).getByRole('link', { name: 'Open the identity' }).getAttribute('href')).toBe(`/identities/${IDENTITY}`);
    expect(within(view).getByRole('link', { name: 'Open the attempt' }).getAttribute('href')).toBe(`/authentication-attempts/${ATTEMPT}`);
    expect(within(view).getByRole('link', { name: 'Open the session' }).getAttribute('href')).toBe(`/authentication-sessions/${SESSION}`);
    expect(within(view).queryByTestId('auth-decision-failure')).toBeNull();
    // Test frames are owner-only search files, never organization face photos.
    expect(uploadKinds).toHaveLength(3);
    for (const kind of uploadKinds) expect(kind).toContain('"kind":"search"');
  });

  const identityQueries = () => bodies().filter((body) => /\bitems: identities\(/u.test(body.query));

  it.each([
    [true, true],
    [false, false],
  ])('should offer only synthetic identities to verify for a sandbox application (sandbox %s)', async (isSandbox, narrowed) => {
    sandbox = isSandbox;
    renderAt('/authenticate-a-face');
    fireEvent.click(await screen.findByRole('combobox', { name: /^Application/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Lobby Kiosk/ }));
    fireEvent.click(await screen.findByRole('combobox', { name: /^Mode/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Verification/ }));
    await waitFor(() => expect(bodies().some((body) => body.query.includes('client_applications_by_pk'))).toBe(true));
    fireEvent.click(await screen.findByRole('combobox', { name: /^Claimed identity/ }));
    await waitFor(() => expect(identityQueries().length).toBeGreaterThan(0));
    const last = JSON.stringify(identityQueries().at(-1)?.variables ?? {});
    expect(last.includes('is_synthetic')).toBe(narrowed);
  });
});

describe('an attempt’s page', () => {
  const offered = async (label: string): Promise<boolean> => {
    await screen.findAllByText('Partial match');
    if (within(main()).queryAllByRole('button', { name: new RegExp(`^${label}$`) }).length > 0) return true;
    const more = within(main()).queryAllByRole('button', { name: 'More' })[0];
    if (more === undefined) return false;
    fireEvent.keyDown(more, { key: 'Enter' });
    const found = screen.queryAllByRole('menuitem').some((item) => item.textContent?.includes(label));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    return found;
  };

  it('should offer Approve and Reject on a pending partial match (Review Focus 3)', async () => {
    renderAt(`/authentication-attempts/${ATTEMPT}`);
    expect(await offered('Approve')).toBe(true);
    expect(await offered('Reject')).toBe(true);
  });

  it('should show the review instead once decided', async () => {
    attempt = attemptRow({ review_status: 'approved', reviewed_at: '2026-10-22T09:05:00Z', review_note: 'Badge checked by the guard' });
    renderAt(`/authentication-attempts/${ATTEMPT}`);
    expect(await offered('Approve')).toBe(false);
    const tab = await screen.findByRole('tab', { name: 'Review' });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    expect(await screen.findByText('Badge checked by the guard')).toBeDefined();
  });

  it('should open the evidence frame through open_file', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    renderAt(`/authentication-attempts/${ATTEMPT}`);
    fireEvent.click(await screen.findByRole('button', { name: /Open file/ }));
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://files.test/evidence', '_blank', 'noopener,noreferrer'));
    expect(bodies().find((body) => body.query.includes('open_file('))?.variables).toEqual({ file_id: EVIDENCE });
    expect(bodies().some((body) => body.query.includes('presignedurl'))).toBe(false);
  });
});
