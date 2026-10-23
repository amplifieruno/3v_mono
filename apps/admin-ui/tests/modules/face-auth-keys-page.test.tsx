// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * An application's keys on screen: the Keys tab lists them without any secret; "Rotate key" shows
 * the new secret once, with the copy button and the warning, and it is nowhere else (no storage,
 * no URL) and gone after a reload (Review Focus 1); a third active key is refused with the
 * server's reason on the form (Review Focus 2); "Revoke key" is offered on an active key only.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const APP = '22222222-2222-4222-8222-000000000002';
const KEY_ACTIVE = '44444444-4444-4444-8444-000000000001';
const KEY_REVOKED = '44444444-4444-4444-8444-000000000002';
const SECRET = 'test-secret-not-real-9f8e7d6c5b4a3928';

const application = {
  id: APP,
  code: 'APP-00001',
  name: 'Lobby Kiosk',
  description: null,
  platform: 'kiosk',
  status: 'active',
  threshold: 0.6,
  threshold_min: 0.5,
  threshold_max: 0.9,
  liveness_required: true,
  use_work_schedules: false,
  is_sandbox: false,
  created_by: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};

const keyRow = (id: string, prefix: string, revokedAt: string | null) => ({
  id,
  application_id: APP,
  key_prefix: prefix,
  created_at: '2026-10-02T08:00:00Z',
  created_by: null,
  expires_at: null,
  last_used_at: '2026-10-20T09:30:00Z',
  revoked_at: revokedAt,
  revoked_by: null,
});

let rotateAnswer: unknown;

interface GraphqlBody {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
}

const bodies = () =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).includes('graphql'))
    .map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody);
const mutations = () => bodies().filter((body) => body.query.trimStart().startsWith('mutation'));

async function serve(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query } = JSON.parse(String(init?.body)) as GraphqlBody;
  if (query.includes('rotate_client_key')) return hasuraResponse(rotateAnswer);
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 2 } } } });
  if (query.includes('client_applications_by_pk')) return hasuraResponse({ data: { item: application } });
  if (/\bitems: client_application_keys\(/u.test(query)) {
    return hasuraResponse({
      data: { items: [keyRow(KEY_ACTIVE, 'Ab12Cd34', null), keyRow(KEY_REVOKED, 'Zz98Yy76', '2026-10-10T10:00:00Z')] },
    });
  }
  return hasuraResponse({ data: { items: [] } });
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ConsoleApp auth={fakeAdminAuth(NOVA, 'Nova Tower Business Center')} />
    </MemoryRouter>,
  );

async function openTab(name: string): Promise<void> {
  const tab = await screen.findByRole('tab', { name });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
}

async function rotate(): Promise<HTMLElement> {
  fireEvent.keyDown((await screen.findAllByRole('button', { name: 'More' }))[0]!, { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: /Rotate key/ }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(await within(dialog).findByRole('button', { name: /^Rotate key/ }));
  return dialog;
}

/** Everything the page could have kept the secret in besides the open dialog. */
function persisted(): string {
  const dump = (storage: Storage) => Object.keys(storage).map((key) => `${key}=${storage.getItem(key) ?? ''}`).join('\n');
  return [dump(localStorage), dump(sessionStorage), window.location.href, document.title].join('\n');
}

beforeAll(() => {
  installDomShims();
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => undefined;
});

beforeEach(() => {
  rotateAnswer = {
    data: { rotate_client_key: { key_id: '44444444-4444-4444-8444-000000000003', application_id: APP, prefix: 'Nw55Ke77', secret: SECRET, expires_at: null } },
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

describe('the Keys tab', () => {
  it('should list the keys by prefix, offering Revoke key on the active one only', async () => {
    renderAt(`/client-applications/${APP}`);
    await openTab('Keys');
    expect(await screen.findByText('Ab12Cd34')).toBeDefined();
    expect(screen.getByText('Zz98Yy76')).toBeDefined();
    const rows = screen.getAllByRole('row');
    const active = rows.find((row) => row.textContent?.includes('Ab12Cd34'));
    const revoked = rows.find((row) => row.textContent?.includes('Zz98Yy76'));
    const offered = async (row: HTMLElement | undefined): Promise<boolean> => {
      const trigger = row === undefined ? null : within(row).queryAllByRole('button').at(-1);
      if (trigger === null || trigger === undefined) return false;
      fireEvent.keyDown(trigger, { key: 'Enter' });
      const items = screen.queryAllByRole('menuitem').map((item) => item.textContent ?? '');
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
      return items.some((text) => text.includes('Revoke key'));
    };
    await waitFor(async () => expect(await offered(active)).toBe(true));
    expect(await offered(revoked)).toBe(false);
  });
});

describe('Rotate key shows the secret once (Review Focus 1)', () => {
  it('should show the secret with copy and the warning, keep it nowhere else, and not show it after a reload', async () => {
    renderAt(`/client-applications/${APP}`);
    const dialog = await rotate();
    const block = await within(dialog).findByTestId('client-key-secret');
    expect((within(block).getByLabelText('Secret') as HTMLInputElement).value).toBe(SECRET);
    expect((within(block).getByLabelText('Prefix') as HTMLInputElement).value).toBe('Nw55Ke77');
    expect(within(block).getByRole('button', { name: /Copy secret/ })).toBeDefined();
    expect(within(block).getByRole('alert').textContent).toMatch(/shown only this once/);
    expect(mutations().map((body) => body.query)).toEqual([expect.stringContaining('rotate_client_key')]);
    expect(mutations()[0]?.variables).toEqual({ application: APP, expires: null });
    expect(persisted()).not.toContain(SECRET);
    // No read after the rotation asks for the secret, and none answers it.
    expect(bodies().filter((body) => !body.query.includes('rotate_client_key')).some((body) => /\bsecret\b/u.test(body.query))).toBe(false);

    // A reload: a fresh console over the same storage and URL.
    cleanup();
    renderAt(`/client-applications/${APP}`);
    await openTab('Keys');
    expect(await screen.findByText('Ab12Cd34')).toBeDefined();
    expect(screen.queryByTestId('client-key-secret')).toBeNull();
    expect(screen.queryByDisplayValue(SECRET)).toBeNull();
    expect(document.body.textContent).not.toContain(SECRET);
  });
});

describe('a third active key (Review Focus 2)', () => {
  it('should be refused with the server’s reason on the form, and show no secret', async () => {
    rotateAnswer = { errors: [{ message: 'client key limit', extensions: { code: 'client_key_limit' } }] };
    renderAt(`/client-applications/${APP}`);
    const dialog = await rotate();
    expect(await within(dialog).findByText(/already has two active keys/)).toBeDefined();
    expect(within(dialog).queryByTestId('client-key-secret')).toBeNull();
    expect(screen.queryByText(/may have been applied/)).toBeNull();
  });
});
