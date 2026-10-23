// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * Bulk jobs on screen over a fake Hasura: a partly failed import shows each failed row's reason in
 * words, counts that add up, and Retry (not Cancel) sending `retry_bulk_job` (Review Focus 3); a
 * running job offers Cancel (not Retry), and once cancelled its progress stops and says so (Review
 * Focus 4); "Import profiles" uploads the CSV as a `bulk_input` file and inserts the job; "Bulk face
 * search" uploads each photo as a `search` image, writes the CSV, and inserts the job with the
 * organization's default threshold.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const JOB = '88888888-8888-4888-8888-000000000001';
const INPUT = '77777777-7777-4777-8777-000000000001';

interface GraphqlBody {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
}

const job = (overrides: Record<string, unknown> = {}) => ({
  id: JOB,
  code: 'BULK-00004',
  kind: 'profile_import',
  status: 'partial',
  input_file_id: INPUT,
  options: { dry_run: false },
  total: 3,
  processed: 3,
  succeeded: 1,
  failed: 1,
  skipped: 1,
  result_file_id: null,
  error: null,
  attempts: 1,
  attempts_at_retry: 0,
  owner_id: 'user-1',
  started_at: '2026-10-22T09:00:01Z',
  completed_at: '2026-10-22T09:00:03Z',
  created_at: '2026-10-22T09:00:00Z',
  ...overrides,
});

const rows = [
  { id: 'r1', bulk_job_id: JOB, row_no: 1, outcome: 'created', error: null, label: null, entity_code: 'PROFILE-00300', profile_id: null, identity_id: null, confidence: null, search_request_id: null, created_at: '2026-10-22T09:00:02Z' },
  { id: 'r2', bulk_job_id: JOB, row_no: 2, outcome: 'failed', error: 'required:last_name', label: null, entity_code: null, profile_id: null, identity_id: null, confidence: null, search_request_id: null, created_at: '2026-10-22T09:00:02Z' },
  { id: 'r3', bulk_job_id: JOB, row_no: 3, outcome: 'skipped', error: null, label: null, entity_code: null, profile_id: null, identity_id: null, confidence: null, search_request_id: null, created_at: '2026-10-22T09:00:02Z' },
];

let record: Record<string, unknown>;
let uploads: string[];

const bodies = (): GraphqlBody[] =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).includes('graphql'))
    .map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody);
const sent = (name: string): GraphqlBody | undefined => bodies().find((body) => body.query.includes(name));
const posts = () => vi.mocked(fetch).mock.calls.filter(([url, init]) => String(url).endsWith('/v1/files') && init?.method === 'POST');

/** The outcomes a related list asks for (`outcome: { _in: [...] }` somewhere in its where). */
function outcomesAsked(value: unknown): string[] | null {
  if (typeof value !== 'object' || value === null) return null;
  const node = value as Record<string, unknown>;
  const outcome = node.outcome as { _in?: string[] } | undefined;
  if (Array.isArray(outcome?._in)) return outcome._in;
  for (const child of Object.values(node)) {
    const found = outcomesAsked(child);
    if (found !== null) return found;
  }
  return null;
}

async function serve(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  if (url.endsWith('/v1/files') && init?.method === 'POST') return hasuraResponse({ processedFiles: [{ id: uploads.shift() ?? INPUT }] });
  if (url.includes('/presignedurl')) return hasuraResponse({ url: `https://files.test/${url.split('/').at(-2)}`, expiration: 60 });
  if (!url.includes('graphql')) return new Response('not here', { status: 404 });
  const { query, variables } = JSON.parse(String(init?.body)) as GraphqlBody;
  if (query.includes('query SearchDefaults')) return hasuraResponse({ data: { organization_settings: [{ recognition_threshold: 0.4 }] } });
  if (query.includes('mutation CreateBulkJob')) return hasuraResponse({ data: { insert_bulk_jobs_one: { id: JOB, code: 'BULK-00005', status: 'queued' } } });
  if (query.includes('retry_bulk_job(')) {
    record = job({ status: 'queued', processed: 0, completed_at: null });
    return hasuraResponse({ data: { retry_bulk_job: [{ id: JOB, code: 'BULK-00004', status: 'queued' }] } });
  }
  if (query.includes('cancel_bulk_job(')) {
    record = job({ ...record, status: 'cancelled', completed_at: '2026-10-22T09:01:00Z' });
    return hasuraResponse({ data: { cancel_bulk_job: [{ id: JOB, code: 'BULK-00004', status: 'cancelled' }] } });
  }
  if (query.includes('query BulkJobProgress')) return hasuraResponse({ data: { bulk_jobs_by_pk: record } });
  if (query.includes('bulk_jobs_by_pk')) return hasuraResponse({ data: { item: record } });
  if (/\bitems: bulk_job_rows\(/u.test(query)) {
    const asked = outcomesAsked(variables);
    return hasuraResponse({ data: { items: rows.filter((row) => asked === null || asked.includes(row.outcome)) } });
  }
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 0 } } } });
  return hasuraResponse({ data: { items: [] } });
}

/** A Blob's text (jsdom's File has no `text()`). */
const readText = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

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
  record = job();
  uploads = [];
  vi.stubGlobal('fetch', vi.fn(serve));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('bulk job page', () => {
  it('should show each failed row’s reason, counts that add up, and Retry only (Review Focus 3)', async () => {
    renderAt(`/bulk-jobs/${JOB}`);
    const page = await main();
    expect(await page.findByText('The “last_name” column is empty; this row needs it.')).toBeDefined();
    expect((await screen.findByTestId('bulk-job-sum')).textContent).toBe('3 rows: 1 succeeded, 1 failed, 1 skipped');
    expect(screen.queryByText('PROFILE-00300')).toBeNull(); // the Failed rows tab lists failed rows only
    expect(await page.findByRole('button', { name: /^Retry/u })).toBeDefined();
    expect(page.queryByRole('button', { name: /^Cancel job/u })).toBeNull();

    fireEvent.click(page.getByRole('button', { name: /^Retry/u }));
    const confirm = await screen.findByRole('dialog');
    fireEvent.click(within(confirm).getByRole('button', { name: /Retry|Confirm|Continue/u }));
    await waitFor(() => expect(sent('retry_bulk_job(')).toBeDefined());
    expect(sent('retry_bulk_job(')?.variables).toEqual({ job: JOB });
    expect(await screen.findByText('The job is queued again.')).toBeDefined();
    await waitFor(() => expect(screen.getByTestId('bulk-job-progress').getAttribute('data-status')).toBe('queued'));
    expect(await screen.findByText('Checking for progress every few seconds…')).toBeDefined(); // following the new run
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Retry/u })).toBeNull());
  });

  it('should list every row on the All rows tab', async () => {
    renderAt(`/bulk-jobs/${JOB}`);
    fireEvent.mouseDown(await (await main()).findByRole('tab', { name: 'All rows' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'All rows' }));
    expect(await screen.findByText('PROFILE-00300')).toBeDefined();
  });

  it('should offer Cancel on a running job, then stop following it and say it was cancelled (Review Focus 4)', async () => {
    record = job({ status: 'running', total: 40, processed: 10, succeeded: 9, failed: 1, skipped: 0, completed_at: null });
    renderAt(`/bulk-jobs/${JOB}`);
    const page = await main();
    expect((await screen.findByTestId('bulk-job-rows-read')).textContent).toContain('10 of 40 rows read');
    expect(screen.getByText('Checking for progress every few seconds…')).toBeDefined();
    expect(page.queryByRole('button', { name: /^Retry/u })).toBeNull();

    fireEvent.click(await page.findByRole('button', { name: /^Cancel job/u }));
    const confirm = await screen.findByRole('dialog');
    fireEvent.click(within(confirm).getByRole('button', { name: /Cancel job|Confirm|Continue/u }));
    await waitFor(() => expect(sent('cancel_bulk_job(')).toBeDefined());
    expect(sent('cancel_bulk_job(')?.variables).toEqual({ job: JOB });
    expect(await screen.findByText('The job is cancelled.')).toBeDefined();
    expect(await screen.findByText('Cancelled: the job stopped; rows applied before stay applied.', {}, { timeout: 8000 })).toBeDefined();
    expect((await screen.findByTestId('bulk-job-sum')).textContent).toBe('40 rows: 9 succeeded, 1 failed, 0 skipped, 30 not reached');
    expect(screen.queryByText('Checking for progress every few seconds…')).toBeNull();
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Cancel job/u })).toBeNull());
    expect(screen.queryByRole('button', { name: /^Retry/u })).toBeNull();
  }, 20_000);

  it('should show the options in words and keep someone else’s input file from you', async () => {
    record = job({ owner_id: 'user-2', options: { dry_run: true } });
    renderAt(`/bulk-jobs/${JOB}`);
    fireEvent.mouseDown(await (await main()).findByRole('tab', { name: 'Details' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Details' }));
    expect(await screen.findByText('Dry run: every row is checked, nothing is saved.')).toBeDefined();
    expect(screen.queryByText('Input file')).toBeNull();
  });

  it('should show why the whole job failed', async () => {
    record = job({ status: 'failed', total: null, processed: 0, succeeded: 0, failed: 0, skipped: 0, error: 'header_unknown:badge' });
    renderAt(`/bulk-jobs/${JOB}`);
    expect(await (await main()).findByText('The header names the column “badge”, which this kind of job does not read.')).toBeDefined();
  });
});

describe('new bulk jobs', () => {
  it('should upload the CSV as a bulk_input file and insert the import job', async () => {
    uploads = [INPUT];
    renderAt('/bulk-jobs');
    fireEvent.click(await (await main()).findByRole('button', { name: /^Import profiles/u }));
    const dialog = await screen.findByRole('dialog');
    const csv = new File(['first_name,last_name\nAda,Lovelace\n'], 'people.csv', { type: 'text/csv' });
    fireEvent.change(await within(dialog).findByLabelText(/^CSV file/u), { target: { files: [csv] } });
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(String((posts()[0]?.[1]?.body as FormData).get('metadata[]'))).toContain('"kind":"bulk_input"');
    await within(dialog).findByRole('link', { name: /Open file/u });
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Import profiles' }).at(-1) as HTMLElement);
    await waitFor(() => expect(sent('mutation CreateBulkJob')).toBeDefined());
    expect(sent('mutation CreateBulkJob')?.variables).toEqual({ object: { kind: 'profile_import', input_file_id: INPUT, options: { dry_run: false } } });
  });

  it('should upload each photo as a search image, write the CSV, and search with the organization’s threshold', async () => {
    const [p1, p2, csvId] = ['aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002', INPUT];
    uploads = [p1, p2, csvId];
    renderAt('/bulk-jobs');
    fireEvent.click(await (await main()).findByRole('button', { name: /^Bulk face search/u }));
    const dialog = await screen.findByRole('dialog');
    const threshold = (await within(dialog).findByLabelText(/^Threshold/u)) as HTMLInputElement;
    await waitFor(() => expect(threshold.value).toBe('0.6'));
    const photos = [new File(['a'], 'lobby, 9am.jpg', { type: 'image/jpeg' }), new File(['b'], 'gate.png', { type: 'image/png' })];
    fireEvent.change(within(dialog).getByLabelText(/^Photos/u), { target: { files: photos } });
    expect(await within(dialog).findByText('2 photos ready; one search runs per photo.')).toBeDefined();
    const kinds = posts().map(([, init]) => String((init?.body as FormData).get('metadata[]')));
    expect(kinds.map((meta) => (JSON.parse(meta) as { metadata: { kind: string } }).metadata.kind)).toEqual(['search', 'search', 'bulk_input']);
    const written = (posts()[2]?.[1]?.body as FormData).get('file[]') as File;
    expect(await readText(written)).toBe(`image_file_id,label\r\n${p1},"lobby, 9am.jpg"\r\n${p2},gate.png\r\n`);
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Bulk face search' }).at(-1) as HTMLElement);
    await waitFor(() => expect(sent('mutation CreateBulkJob')).toBeDefined());
    expect(sent('mutation CreateBulkJob')?.variables).toEqual({
      object: { kind: 'bulk_search', input_file_id: csvId, options: { threshold: 0.6, max_results: 5 } },
    });
  });
});
