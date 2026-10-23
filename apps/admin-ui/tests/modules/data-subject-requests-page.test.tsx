// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * Data subject requests on screen: a partial erasure says what legal holds kept and links the
 * holds (Review Focus 1); a completed access request opens its bundle through the audited
 * `open_file` (a sensitive file is never presigned); the steps timeline words the job's steps.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const REQUEST = '66666666-6666-4666-8666-000000000061';
const PROFILE = '44444444-4444-4444-8444-000000000041';
const HOLD = '33333333-3333-4333-8333-000000000031';
const FILE = '77777777-7777-4777-8777-000000000071';
const AT = '2026-10-20T09:00:00.000Z';

let request: Record<string, unknown> = {};
let steps: unknown[] = [];

interface GraphqlBody {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
}

const graphqlBodies = () =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).includes('graphql'))
    .map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody);

const step = (name: string, details: Record<string, unknown> = {}) => ({ id: `s-${name}`, step: name, at: AT, details });

async function serve(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query } = JSON.parse(String(init?.body)) as GraphqlBody;
  if (query.includes('DataSubjectRequestProgress')) {
    return hasuraResponse({ data: { data_subject_requests_by_pk: { ...request, steps } } });
  }
  if (query.includes('LegalHoldNames')) return hasuraResponse({ data: { legal_holds: [{ id: HOLD, name: 'Litigation Smith' }] } });
  if (query.includes('OpenFile')) return hasuraResponse({ data: { open_file: { url: 'https://files.test/bundle.zip', expires_at: AT } } });
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 0 } } } });
  if (query.includes('data_subject_requests_by_pk')) return hasuraResponse({ data: { item: request } });
  return hasuraResponse({ data: { items: [] } });
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ConsoleApp auth={fakeAdminAuth(NOVA, 'Nova Tower Business Center')} />
    </MemoryRouter>,
  );

const base = {
  id: REQUEST,
  code: 'DSR-00042',
  profile_id: PROFILE,
  status: 'completed',
  received_at: AT,
  due_at: AT,
  completed_at: AT,
  partial: false,
  details: {},
  notes: null,
  outcome: null,
  rejection_reason: null,
  export_file_id: null,
  requested_by: null,
  attempts: 1,
  last_error: null,
  lease_expires_at: null,
  overdue_notified_at: null,
  created_at: AT,
};

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

describe('a partial erasure (Review Focus 1)', () => {
  it('should say what the legal holds kept and link the holds', async () => {
    request = { ...base, request_type: 'erasure', partial: true };
    steps = [
      step('claimed', { attempt: 1 }),
      step('restricted'),
      step('purged', { class: 'detections', affected: 4, held: 2, files_enqueued: 1 }),
      step('files_queued', { files: 1 }),
      step('retained', { categories: ['detections', 'profile', 'identities'], hold_ids: [HOLD] }),
      step('completed', { partial: true }),
    ];
    renderAt(`/data-subject-requests/${REQUEST}`);
    const partial = await screen.findByTestId('dsr-partial');
    expect(within(partial).getByTestId('dsr-partial-categories').textContent).toBe('Detections, Profile, Identities');
    expect(await within(partial).findByRole('link', { name: 'Litigation Smith' })).toBeDefined();
    const timeline = screen.getByTestId('dsr-steps');
    expect(within(timeline).getByTestId('dsr-step:purged').textContent).toContain('Detections: 4 rows erased, 2 kept by legal holds, 1 files queued');
    expect(within(timeline).getByTestId('dsr-step:completed').textContent).toContain('Completed partially (legal hold)');
  });

  it('should show no partial notice on a complete erasure', async () => {
    request = { ...base, request_type: 'erasure' };
    steps = [step('claimed', { attempt: 1 }), step('profile_anonymized'), step('completed', { partial: false })];
    renderAt(`/data-subject-requests/${REQUEST}`);
    await screen.findByTestId('dsr-step:profile_anonymized');
    expect(screen.queryByTestId('dsr-partial')).toBeNull();
  });
});

describe('the bundle of an access request', () => {
  it('should open through open_file, never a presigned link', async () => {
    request = { ...base, request_type: 'access', export_file_id: FILE };
    steps = [step('claimed', { attempt: 1 }), step('export_uploaded', { files: 4, missing_files: 0, file_id: FILE }), step('completed')];
    const opened = vi.spyOn(window, 'open').mockReturnValue(null);
    renderAt(`/data-subject-requests/${REQUEST}`);
    await screen.findByText('Bundle prepared (4 files, 0 missing)');
    fireEvent.click(await screen.findByRole('button', { name: 'Open file' }));
    await vi.waitFor(() => expect(opened).toHaveBeenCalledWith('https://files.test/bundle.zip', '_blank', 'noopener,noreferrer'));
    const open = graphqlBodies().find((body) => body.query.includes('OpenFile'));
    expect(open?.variables).toEqual({ file_id: FILE });
    expect(graphqlBodies().some((body) => body.query.includes('presigned'))).toBe(false);
  });
});

describe('filing an erasure (Review Focus 1)', () => {
  it('should ask for the person, show the review and the typed confirmation', async () => {
    renderAt('/data-subject-requests');
    fireEvent.click(await screen.findByRole('button', { name: 'Erasure request' }));
    expect(await screen.findByText('Choose the person to see what will be erased.')).toBeDefined();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByLabelText(/Type the person’s code to confirm/).length).toBeGreaterThan(0);
    expect(graphqlBodies().some((body) => body.query.includes('CreateDataSubjectRequest'))).toBe(false);
  });
});
