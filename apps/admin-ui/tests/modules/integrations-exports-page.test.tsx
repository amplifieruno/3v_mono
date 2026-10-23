// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';
import { LocationProbe } from '../support/location-probe';

/**
 * Integrations and exports on screen: the write-only secret goes to `set_integration_secret` only
 * (never a read, storage or the URL) and the page shows only whether one is stored; Run sync opens
 * the new run; the schedule reads as a sentence; an export file is offered to its owner only, others
 * see the reason and no link (Review Focus 4); Run now opens the new job.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const INTEGRATION = '88888888-8888-4888-8888-000000000081';
const RUN = '88888888-8888-4888-8888-000000000082';
const DEFINITION = '99999999-9999-4999-8999-000000000091';
const JOB = '99999999-9999-4999-8999-000000000092';
const FILE = '77777777-7777-4777-8777-000000000071';
const OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000a1';
const SECRET = 'test-secret-not-real-7f3a';
const AT = '2026-10-20T09:00:00.000Z';
/** `fakeAdminAuth`'s user id. */
const ME = 'user-1';

interface GraphqlBody {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
}

const bodies = (): GraphqlBody[] =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).includes('graphql'))
    .map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody);
const mutations = () => bodies().filter((body) => body.query.trimStart().startsWith('mutation'));

const integrationRow = {
  id: INTEGRATION,
  code: 'INT-00042',
  name: 'Workday HR feed',
  kind: 'hr',
  provider: 'Workday (fixture)',
  direction: 'inbound',
  status: 'active',
  description: null,
  config: { schedule_cron: '0 2 * * *', schedule_timezone: 'Europe/Moscow', external_id_field: 'EmployeeNumber' },
  field_mapping: { GivenName: 'first_name' },
  has_secret: false,
  last_sync_at: AT,
  next_sync_at: null,
  last_error: null,
  created_by: null,
  created_at: AT,
  updated_at: AT,
};

let jobRow: Record<string, unknown> = {};
let definitionRow: Record<string, unknown> = {};

async function serve(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query } = JSON.parse(String(init?.body)) as GraphqlBody;
  if (query.includes('SetIntegrationSecret')) return hasuraResponse({ data: { set_integration_secret: { integration_id: INTEGRATION, has_secret: true } } });
  if (query.includes('RunIntegrationSync')) return hasuraResponse({ data: { run_integration_sync: { run_id: RUN, integration_id: INTEGRATION, status: 'running' } } });
  if (query.includes('SetIntegrationSchedule')) return hasuraResponse({ data: { set: { id: INTEGRATION, config: {}, next_sync_at: null } } });
  if (query.includes('RunExport')) return hasuraResponse({ data: { insert_export_jobs_one: { id: JOB, status: 'queued' } } });
  if (query.includes('OpenFile')) return hasuraResponse({ data: { open_file: { url: 'https://files.test/export.csv', expires_at: AT } } });
  if (query.includes('JobStatus')) return hasuraResponse({ data: { export_jobs_by_pk: { id: JOB, status: 'completed' } } });
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 0 } } } });
  if (query.includes('integrations_by_pk')) return hasuraResponse({ data: { item: integrationRow } });
  if (query.includes('export_jobs_by_pk')) return hasuraResponse({ data: { item: jobRow } });
  if (query.includes('export_definitions_by_pk')) return hasuraResponse({ data: { item: definitionRow } });
  return hasuraResponse({ data: { items: [] } });
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ConsoleApp auth={fakeAdminAuth(NOVA, 'Nova Tower Business Center')} />
      <LocationProbe full />
    </MemoryRouter>,
  );

const routerLocation = (): string => screen.getByTestId('location').textContent ?? '';

/** Everything the page could have kept the secret in besides the open dialog. */
function persisted(): string {
  const dump = (storage: Storage) => Object.keys(storage).map((key) => `${key}=${storage.getItem(key) ?? ''}`).join('\n');
  return [dump(localStorage), dump(sessionStorage), routerLocation(), document.title].join('\n');
}

/** buro's flow attempts in this tab (`buro:attempt:v1:<user>:<flow>:<slot>`). */
const attemptKeys = (): string[] => Object.keys(sessionStorage).filter((key) => key.startsWith('buro:attempt:'));

async function menuItem(name: RegExp): Promise<void> {
  fireEvent.keyDown((await screen.findAllByRole('button', { name: 'More' }))[0]!, { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name }));
}

beforeAll(() => {
  installDomShims();
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => undefined;
});

beforeEach(() => {
  jobRow = {
    id: JOB,
    created_at: AT,
    definition_id: DEFINITION,
    trigger: 'manual',
    status: 'completed',
    entity: 'profiles',
    format: 'csv',
    mode: 'full',
    filters: {},
    row_count: 12,
    truncated: false,
    file_id: FILE,
    requested_by: ME,
    watermark_from: null,
    watermark_to: null,
    error: null,
    attempts: 1,
    started_at: AT,
    finished_at: AT,
  };
  definitionRow = {
    id: DEFINITION,
    code: 'EXP-00042',
    name: 'Staff directory',
    description: null,
    entity: 'profiles',
    format: 'csv',
    filters: {},
    mode: 'full',
    max_rows: null,
    schedule_cron: null,
    timezone: 'UTC',
    is_active: true,
    owner_id: ME,
    watermark: null,
    next_run_at: null,
    last_run_at: null,
    last_error: null,
    created_at: AT,
    updated_at: AT,
  };
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal('fetch', vi.fn(serve));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('an integration', () => {
  it('should show its schedule as a sentence and never read its secret', async () => {
    renderAt(`/integrations/${INTEGRATION}`);
    expect((await screen.findByTestId('integration-schedule')).textContent).toBe('Schedule: At 02:00 every day (Europe/Moscow)');
    expect(screen.getByText('EmployeeNumber')).toBeDefined();
    const reads = bodies().filter((body) => body.query.includes('integrations'));
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.some((body) => /\bsecret\b/u.test(body.query))).toBe(false);
    expect(reads.some((body) => body.query.includes('has_secret'))).toBe(true);
  });

  it('should send a typed secret to set_integration_secret only and keep it nowhere', async () => {
    renderAt(`/integrations/${INTEGRATION}`);
    await menuItem(/Set secret/);
    const dialog = await screen.findByRole('dialog');
    const box = (await within(dialog).findAllByLabelText(/New secret/)).find((node) => node instanceof HTMLInputElement) as HTMLInputElement;
    expect(box.type).toBe('password');
    fireEvent.change(box, { target: { value: SECRET } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^Set secret/ }));
    await waitFor(() => expect(mutations().map((body) => body.query)).toEqual([expect.stringContaining('set_integration_secret')]));
    expect(mutations()[0]?.variables).toEqual({ integration: INTEGRATION, secret: SECRET });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Only that mutation carried it: no read, no storage, no URL.
    expect(bodies().filter((body) => !body.query.includes('set_integration_secret')).some((body) => JSON.stringify(body).includes(SECRET))).toBe(false);
    expect(persisted()).not.toContain(SECRET);
    expect(document.body.textContent).not.toContain(SECRET);
    // buro's write-ahead attempt (a hash over the body, secret included) is removed on success.
    expect(attemptKeys()).toEqual([]);
  });

  it('should show what a lost Set secret answer leaves in the tab (G84)', async () => {
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(init?.body).includes('SetIntegrationSecret')) throw new TypeError('Failed to fetch');
      return serve(input, init);
    });
    renderAt(`/integrations/${INTEGRATION}`);
    await menuItem(/Set secret/);
    const dialog = await screen.findByRole('dialog');
    const box = (await within(dialog).findAllByLabelText(/New secret/)).find((node) => node instanceof HTMLInputElement) as HTMLInputElement;
    fireEvent.change(box, { target: { value: SECRET } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^Set secret/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 200));
    // Never the secret itself; but see G84 for the body hash buro may keep after a lost answer.
    expect(persisted()).not.toContain(SECRET);
    const kept = attemptKeys().map((key) => sessionStorage.getItem(key) ?? '');
    expect(kept.every((entry) => !entry.includes(SECRET))).toBe(true);
    // G84: the attempt stays `unknown` with an unsalted SHA-256 over the body (the secret included)
    // and buro 0.6.0 offers no opt-out; this pins the behaviour so a fix in buro shows up here.
    expect(kept.map((entry) => JSON.parse(entry) as Record<string, unknown>)).toEqual([
      expect.objectContaining({ mutation: 'itap:set-integration-secret', state: 'unknown', bodyHash: expect.stringMatching(/^[0-9a-f]{64}$/) }),
    ]);
  });

  /** Sets a secret whose answer is lost, the integration reading `before` until the send and `after` from then on. */
  async function loseSecretAnswer(before: boolean, after: boolean): Promise<HTMLElement> {
    let sent = false;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const body = String(init?.body);
      if (body.includes('SetIntegrationSecret')) {
        sent = true;
        throw new TypeError('Failed to fetch');
      }
      if (body.includes('integrations_by_pk')) return hasuraResponse({ data: { item: { ...integrationRow, has_secret: sent ? after : before } } });
      return serve(input, init);
    });
    renderAt(`/integrations/${INTEGRATION}`);
    await menuItem(/Set secret/);
    const dialog = await screen.findByRole('dialog');
    const box = (await within(dialog).findAllByLabelText(/New secret/)).find((node) => node instanceof HTMLInputElement) as HTMLInputElement;
    fireEvent.change(box, { target: { value: SECRET } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^Set secret/ }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Check again' }));
    return dialog;
  }

  it('should confirm a lost Set secret answer when the re-read shows a secret that was not there', async () => {
    await loseSecretAnswer(false, true);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(attemptKeys()).toEqual([]);
  });

  it('should leave a lost Set secret answer unknown when a secret was already stored', async () => {
    const dialog = await loseSecretAnswer(true, true);
    await new Promise((resolve) => setTimeout(resolve, 200));
    // The old secret answers `has_secret: true` whether or not the request landed: never "stored".
    expect(screen.queryByRole('dialog')).toBe(dialog);
    expect(within(dialog).getByRole('button', { name: 'Check again' })).toBeDefined();
    expect(attemptKeys().map((key) => (JSON.parse(sessionStorage.getItem(key) ?? '{}') as Record<string, unknown>).state)).toEqual(['unknown']);
  });

  it('should not offer Clear secret while none is stored', async () => {
    renderAt(`/integrations/${INTEGRATION}`);
    fireEvent.keyDown((await screen.findAllByRole('button', { name: 'More' }))[0]!, { key: 'Enter' });
    await screen.findByRole('menuitem', { name: /Set secret/ });
    expect(screen.queryByRole('menuitem', { name: /Clear secret/ })).toBeNull();
  });

  it('should edit the schedule with the cron field, writing only its two keys', async () => {
    renderAt(`/integrations/${INTEGRATION}`);
    await menuItem(/Schedule/);
    const dialog = await screen.findByRole('dialog');
    const cron = (await within(dialog).findAllByLabelText(/When/)).find((node) => node instanceof HTMLInputElement) as HTMLInputElement;
    expect(cron.value).toBe('0 2 * * *');
    fireEvent.change(cron, { target: { value: '30 6 * * 1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^Schedule/ }));
    await waitFor(() => expect(mutations().map((body) => body.query)).toEqual([expect.stringContaining('SetIntegrationSchedule')]));
    expect(mutations()[0]?.variables).toEqual({
      id: INTEGRATION,
      schedule: { schedule_cron: '30 6 * * 1', schedule_timezone: 'Europe/Moscow' },
      set: true,
      clear: false,
    });
  });

  it('should open the new sync run after Run sync', async () => {
    renderAt(`/integrations/${INTEGRATION}`);
    fireEvent.click((await screen.findAllByRole('button', { name: /Run sync/ }))[0]!);
    await waitFor(() => expect(routerLocation()).toBe(`/integration-sync-runs/${RUN}`));
    expect(mutations()[0]?.variables).toEqual({ integration: INTEGRATION });
  });
});

describe('an export file (Review Focus 4)', () => {
  it('should open through open_file for its owner', async () => {
    const opened = vi.spyOn(window, 'open').mockReturnValue(null);
    renderAt(`/export-jobs/${JOB}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Open file' }));
    await vi.waitFor(() => expect(opened).toHaveBeenCalledWith('https://files.test/export.csv', '_blank', 'noopener,noreferrer'));
    expect(bodies().find((body) => body.query.includes('OpenFile'))?.variables).toEqual({ file_id: FILE });
  });

  it('should offer no link to another member and say why', async () => {
    jobRow = { ...jobRow, requested_by: OTHER };
    renderAt(`/export-jobs/${JOB}`);
    expect(await screen.findByText(/Only the member who ran the export can open its file/)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Open file' })).toBeNull();
    expect(bodies().some((body) => body.query.includes('OpenFile'))).toBe(false);
  });
});

describe('an export definition', () => {
  it('should open the new job after Run now (owner)', async () => {
    renderAt(`/export-definitions/${DEFINITION}`);
    fireEvent.click((await screen.findAllByRole('button', { name: /Run now/ }))[0]!);
    await waitFor(() => expect(routerLocation()).toBe(`/export-jobs/${JOB}`));
    expect(mutations()[0]?.variables).toEqual({ definition: DEFINITION });
  });

  it('should not let another member run, edit or delete it', async () => {
    definitionRow = { ...definitionRow, owner_id: OTHER };
    renderAt(`/export-definitions/${DEFINITION}`);
    const run = (await screen.findAllByRole('button', { name: /Run now/ }))[0]!;
    expect(run.hasAttribute('disabled') || run.getAttribute('aria-disabled') === 'true').toBe(true);
    fireEvent.click(run);
    expect(mutations()).toEqual([]);
  });
});
