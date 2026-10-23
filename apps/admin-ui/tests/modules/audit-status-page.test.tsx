// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * System status and the audit log on screen: the status page renders with a probe down (that probe
 * shows Down with its error, the rest still shows; Review Focus 5), names crons and queues in words
 * (unknown ones too) and checks again on demand; when the backend does not answer it says so. An
 * audit entry's page shows the change field by field (nested keys, Redacted for secrets, never their
 * value) and links its record when it has a page; the list shows an unknown table by its raw name.
 * Nothing here sends a mutation.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const ENTRY = 'abababab-abab-4bab-8bab-000000000001';
const DEVICE = '66666666-6666-4666-8666-000000000061';
const RUN = '77777777-7777-4777-8777-000000000071';
const AT = '2026-10-23T10:00:00.000Z';

interface GraphqlBody {
  readonly query: string;
}

const bodies = (): GraphqlBody[] =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).includes('graphql'))
    .map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody);

const STATUS = {
  generated_at: AT,
  status: 'down',
  checks: [
    { name: 'hasura', status: 'ok', latency_ms: 4 },
    { name: 'postgres', status: 'ok', latency_ms: 21 },
    { name: 'insightface', status: 'down', latency_ms: 3002, details: { error: 'The operation was aborted due to timeout' } },
    { name: 'storage', status: 'ok', latency_ms: 6 },
    { name: 'stream_server', status: 'degraded', latency_ms: 1400 },
  ],
  postgres: { connections: 14, max_connections: 100, db_size_bytes: 52_428_800, largest_tables: [{ table: 'itap.detections', total_bytes: 10_485_760 }] },
  crons: [
    { name: 'retention_cleanup', status: 'ok', lag_seconds: 0, errors_24h: 0, last_scheduled_at: AT, last_delivered_at: AT },
    { name: 'brand_new_job', status: 'degraded', lag_seconds: 420, errors_24h: 2, last_scheduled_at: AT, last_delivered_at: null },
  ],
  queues: { file_deletions: 3, brand_new_queue: 1 },
  retention: { run_id: RUN, scheduled_at: AT, started_at: AT, finished_at: AT, status: 'completed', error: null },
  scopes: {},
};

let statusAnswer: () => Response = () => hasuraResponse({ data: { get_system_status: STATUS } });
let entryRow: Record<string, unknown> = {};

async function serve(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query } = JSON.parse(String(init?.body)) as GraphqlBody;
  if (query.includes('get_system_status')) return statusAnswer();
  if (query.includes('audit_log_by_pk')) return hasuraResponse({ data: { item: entryRow } });
  if (query.includes('audit_log')) {
    return hasuraResponse({ data: { items: [entryRow, { ...entryRow, id: 'abababab-abab-4bab-8bab-000000000002', entity: 'brand_new_table', entity_id: null, changes: null }] } });
  }
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 0 } } } });
  return hasuraResponse({ data: { items: [] } });
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ConsoleApp auth={fakeAdminAuth(NOVA, 'Nova Tower Business Center')} />
    </MemoryRouter>,
  );

beforeAll(() => {
  installDomShims();
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => undefined;
});

beforeEach(() => {
  statusAnswer = () => hasuraResponse({ data: { get_system_status: STATUS } });
  entryRow = {
    id: ENTRY,
    occurred_at: AT,
    action: 'update',
    entity: 'devices',
    entity_id: DEVICE,
    user_id: null,
    reason: null,
    ip: null,
    user_agent: null,
    changes: {
      name: { old: 'Lobby Camera', new: 'Main Lobby Camera' },
      password: { old: '[redacted]', new: '[redacted]' },
      coverage: { old: { type: 'Circle', radius: 150 }, new: { type: 'Circle', radius: 230 } },
    },
  };
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(serve));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the system status page', () => {
  it('should render every section with a probe down, naming jobs and queues in words', async () => {
    renderAt('/system-status');
    const insightface = await screen.findByTestId('system-status:check:insightface');
    expect(insightface.textContent).toContain('Face recognition (InsightFace)');
    expect(insightface.textContent).toContain('Down');
    expect(insightface.textContent).toContain('aborted due to timeout');
    expect(screen.getByTestId('system-status:check:hasura').textContent).toContain('OK');
    expect(screen.getByTestId('system-status:check:stream_server').textContent).toContain('Degraded');
    expect(screen.getByTestId('system-status:overall').textContent).toBe('Down');
    expect(screen.getByTestId('system-status:db-size').textContent).toBe('50.0 MB');
    expect(screen.getByTestId('system-status:cron:retention_cleanup').textContent).toContain('Retention run');
    const unknownCron = screen.getByTestId('system-status:cron:brand_new_job');
    expect(unknownCron.textContent).toContain('Brand new job');
    expect(within(unknownCron).getByTestId('system-status:lag').textContent).toBe('7 min');
    expect(screen.getByTestId('system-status:queue:file_deletions').textContent).toBe('Files to delete3');
    expect(screen.getByTestId('system-status:queue:brand_new_queue').textContent).toBe('Brand new queue1');
    expect(within(screen.getByTestId('system-status:retention')).getByRole('link', { name: 'Open the run' }).getAttribute('href')).toContain(RUN);
    expect(bodies().some((body) => body.query.trimStart().startsWith('mutation'))).toBe(false);
  });

  it('should check again on demand', async () => {
    renderAt('/system-status');
    await screen.findByTestId('system-status:check:insightface');
    const before = bodies().filter((body) => body.query.includes('get_system_status')).length;
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(bodies().filter((body) => body.query.includes('get_system_status')).length).toBe(before + 1));
  });

  it('should say so when the backend does not answer', async () => {
    statusAnswer = () => hasuraResponse({ errors: [{ message: 'http exception when calling webhook', extensions: { code: 'unexpected' } }] });
    renderAt('/system-status');
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be read/);
    expect(screen.getByRole('button', { name: /Check again|Checking/ })).toBeDefined();
  });
});

describe('the audit log', () => {
  it('should show a change field by field with secrets redacted, and link the record', async () => {
    renderAt(`/audit-log/${ENTRY}`);
    const diff = await screen.findByTestId('audit-diff');
    expect(diff.getAttribute('data-kind')).toBe('changes');
    const name = within(diff).getByTestId('audit-diff:row:name');
    expect(within(name).getByTestId('audit-diff:before').textContent).toBe('Lobby Camera');
    expect(within(name).getByTestId('audit-diff:after').textContent).toBe('Main Lobby Camera');
    expect(within(diff).getByTestId('audit-diff:row:coverage.radius').textContent).toContain('150');
    expect(within(within(diff).getByTestId('audit-diff:row:password')).getAllByTestId('audit-diff:redacted')).toHaveLength(2);
    expect(diff.textContent).not.toContain('[redacted]');
    const link = await screen.findByRole('link', { name: 'Main Lobby Camera' });
    expect(link.getAttribute('href')).toBe(`/devices/${DEVICE}`);
    expect(bodies().some((body) => body.query.trimStart().startsWith('mutation'))).toBe(false);
  });

  it('should not link a removed row, and show a purge without values', async () => {
    entryRow = { ...entryRow, action: 'delete', changes: { retention: true } };
    renderAt(`/audit-log/${ENTRY}`);
    const diff = await screen.findByTestId('audit-diff');
    expect(diff.getAttribute('data-kind')).toBe('retention');
    expect(screen.queryByRole('link', { name: /66666666/ })).toBeNull();
  });

  it('should list entries with an unknown table by its raw name and offer no create', async () => {
    renderAt('/audit-log');
    expect(await screen.findByText('brand_new_table')).toBeDefined();
    expect(screen.getAllByText('Device').length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /Create|New/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Create|^New/ })).toBeNull();
  });
});
