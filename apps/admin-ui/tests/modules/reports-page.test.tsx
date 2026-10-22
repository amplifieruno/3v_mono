// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * Reports on screen over a fake Hasura (Review Focus 4): a failed report shows its error and a Retry
 * that sends `retry_report`; a completed report opens its file through a presigned link and offers no
 * Retry; a report generating while the page is open is followed until its file is there; the
 * new-report form refuses a period over 366 days before anything is sent (Review Focus 3).
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const REPORT = '66666666-6666-4666-8666-000000000001';
const FILE = '77777777-7777-4777-8777-000000000001';

interface GraphqlBody {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
}

const row = (overrides: Record<string, unknown> = {}) => ({
  id: REPORT,
  code: 'REPORT-00010',
  title: 'Visit frequency 2026-10-12 - 2026-10-18',
  description: null,
  report_type: 'behavior',
  status: 'failed',
  format: 'pdf',
  start_date: '2026-10-12',
  end_date: '2026-10-18',
  incident_id: null,
  parameters: { period: 'previous_week', timezone: 'Europe/Moscow' },
  template_id: null,
  schedule_id: null,
  file_id: null,
  error: 'File upload failed: storage service unavailable (HTTP 503)',
  attempts: 1,
  attempts_at_retry: 0,
  generated_at: null,
  created_by: null,
  created_at: '2026-10-19T07:30:00Z',
  updated_at: '2026-10-19T07:31:00Z',
  ...overrides,
});

/** What the record reads answer, and what the progress reads answer (the progress may run ahead). */
let record: Record<string, unknown>;
let progress: Record<string, unknown>;

const graphqlBodies = (): GraphqlBody[] =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).includes('graphql'))
    .map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody);
const mutations = () => graphqlBodies().filter((body) => body.query.trimStart().startsWith('mutation'));

async function serve(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  if (url.includes('/presignedurl')) return hasuraResponse({ url: `http://storage.test/${FILE}.pdf`, expiration: 60 });
  const { query } = JSON.parse(String(init?.body)) as GraphqlBody;
  if (query.includes('retry_report')) {
    record = row({ status: 'queued', error: null });
    progress = record;
    return hasuraResponse({ data: { retry_report: [{ id: REPORT, status: 'queued' }] } });
  }
  if (query.includes('query ReportProgress')) return hasuraResponse({ data: { reports_by_pk: progress } });
  if (query.includes('reports_by_pk')) return hasuraResponse({ data: { item: record } });
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 0 } } } });
  return hasuraResponse({ data: { items: [] } });
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ConsoleApp auth={fakeAdminAuth(NOVA, 'Nova Tower Business Center')} />
    </MemoryRouter>,
  );

configure({ asyncUtilTimeout: 5000 });

beforeAll(() => {
  installDomShims();
  Element.prototype.scrollIntoView ??= () => undefined;
  Element.prototype.hasPointerCapture ??= () => false;
});

beforeEach(() => {
  localStorage.clear();
  record = row();
  progress = record;
  vi.stubGlobal('fetch', vi.fn(serve));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('report page', () => {
  it('should show a failed report’s error and retry it through retry_report', async () => {
    renderAt(`/reports/${REPORT}`);
    expect(await screen.findByRole('heading', { name: 'Generation failed' })).toBeDefined();
    expect(screen.getByText('File upload failed: storage service unavailable (HTTP 503)')).toBeDefined();
    expect((await screen.findByTestId('report-step:failed')).getAttribute('data-state')).toBe('failed');
    expect(screen.queryByRole('link', { name: /Open/ })).toBeNull();

    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    const confirm = await screen.findByRole('dialog');
    fireEvent.click(within(confirm).getByRole('button', { name: /Retry|Confirm|Continue/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    expect(mutations()[0]?.query).toContain('retry_report(args: { p_report: $report })');
    expect(mutations()[0]?.variables).toEqual({ report: REPORT });
    expect(await screen.findByText('The report is queued again.')).toBeDefined();
    // Read again: queued, the error gone.
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Generation failed' })).toBeNull());
  });

  it('should open a completed report’s file and offer no Retry', async () => {
    record = row({ status: 'completed', error: null, file_id: FILE, generated_at: '2026-10-19T07:30:20Z' });
    progress = record;
    renderAt(`/reports/${REPORT}`);
    const open = await screen.findByRole('link', { name: /Open/ });
    await waitFor(() => expect(open.getAttribute('href')).toBe(`http://storage.test/${FILE}.pdf`));
    expect(open.getAttribute('target')).toBe('_blank');
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith(`/v1/files/${FILE}/presignedurl`))).toBe(true);
    expect((await screen.findByTestId('report-step:completed')).getAttribute('data-state')).toBe('done');
    expect(screen.queryByRole('heading', { name: 'Generation failed' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('should offer no Retry on a queued report', async () => {
    record = row({ status: 'queued', error: null, attempts: 0 });
    progress = record;
    renderAt(`/reports/${REPORT}`);
    expect((await screen.findByTestId('report-step:generating')).getAttribute('data-state')).toBe('todo');
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'File' })).toBeNull();
  });

  it('should follow a report generating while the page is open until its file is there', async () => {
    record = row({ status: 'generating', error: null });
    progress = record;
    renderAt(`/reports/${REPORT}`);
    expect((await screen.findByTestId('report-step:generating')).getAttribute('data-state')).toBe('current');
    // The report completes server-side: the progress read sees it first, then the page reads the record again.
    progress = row({ status: 'completed', error: null, file_id: FILE, generated_at: '2026-10-19T07:30:20Z' });
    record = progress;
    const open = await screen.findByRole('link', { name: /Open/ }, { timeout: 8000 });
    await waitFor(() => expect(open.getAttribute('href')).toBe(`http://storage.test/${FILE}.pdf`));
  }, 15_000);
});

describe('new report', () => {
  it('should refuse a period over 366 days before sending anything (Review Focus 3)', async () => {
    renderAt('/reports');
    fireEvent.click(await screen.findByRole('button', { name: 'New report' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(await within(dialog).findByRole('textbox', { name: /^Title/ }), { target: { value: 'Year' } });
    // The type picker: Busy hours, a period report over facilities.
    fireEvent.click(within(dialog).getByRole('combobox', { name: /^Type/ }));
    fireEvent.click(await screen.findByRole('option', { name: /^Busy hours/ }));
    fireEvent.change(await within(dialog).findByLabelText(/^From/), { target: { value: '2025-01-01' } });
    fireEvent.change(within(dialog).getByLabelText(/^To/), { target: { value: '2026-01-03' } });
    const submit = within(dialog).getAllByRole('button', { name: 'New report' }).find((button) => button.getAttribute('type') === 'submit');
    fireEvent.click(submit ?? within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(await within(dialog).findByText(/at most 367 days/)).toBeDefined();
    expect(mutations()).toHaveLength(0);
  });
});
