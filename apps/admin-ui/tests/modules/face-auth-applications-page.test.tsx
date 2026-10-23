// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * A client application on screen: a sandbox application's Population tab shows its segment of
 * test identities and no facilities or access points, and its "More" menu offers no "Add facility"
 * or "Add access point" (Review Focus 5); a production application shows and offers all of them,
 * with Suspend and Revoke by its status.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const APP = '22222222-2222-4222-8222-000000000001';
const SEGMENT = '33333333-3333-4333-8333-000000000001';

const applicationRow = (extra: Record<string, unknown>) => ({
  id: APP,
  code: 'APP-00004',
  name: 'Developer Sandbox',
  description: null,
  platform: 'server',
  status: 'active',
  threshold: 0.55,
  threshold_min: 0.5,
  threshold_max: 0.9,
  liveness_required: false,
  use_work_schedules: false,
  is_sandbox: true,
  created_by: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...extra,
});

let application = applicationRow({});

interface GraphqlBody {
  readonly query: string;
}

const mutations = () =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).includes('graphql'))
    .map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody)
    .filter((body) => body.query.trimStart().startsWith('mutation'));

async function serve(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query } = JSON.parse(String(init?.body)) as GraphqlBody;
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 1 } } } });
  if (query.includes('client_applications_by_pk')) return hasuraResponse({ data: { item: application } });
  if (/\bitems: client_application_segments\(/u.test(query)) {
    return hasuraResponse({
      data: { items: [{ id: 'b1', application_id: APP, segment_id: SEGMENT, created_at: '2026-10-01T00:00:00Z', segment: { id: SEGMENT, name: 'Sandbox test identities' } }] },
    });
  }
  if (query.includes('segments_by_pk') || /\bitems: segments\(/u.test(query)) {
    return hasuraResponse({ data: { items: [{ id: SEGMENT, name: 'Sandbox test identities' }], item: { id: SEGMENT, name: 'Sandbox test identities' } } });
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

async function menuItems(): Promise<string[]> {
  fireEvent.keyDown((await screen.findAllByRole('button', { name: 'More' }))[0]!, { key: 'Enter' });
  return (await screen.findAllByRole('menuitem')).map((item) => item.textContent ?? '');
}

beforeAll(() => {
  installDomShims();
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => undefined;
});

beforeEach(() => {
  application = applicationRow({});
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(serve));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a sandbox application binds no places (Review Focus 5)', () => {
  it('should show its segment of test identities and no facilities or access points', async () => {
    renderAt(`/client-applications/${APP}`);
    await openTab('Population');
    expect(await screen.findByText('Sandbox population: segments')).toBeDefined();
    expect(screen.queryByText('Facilities')).toBeNull();
    expect(screen.queryByText('Access points')).toBeNull();
    const items = await menuItems();
    expect(items.some((text) => text.includes('Add segment'))).toBe(true);
    expect(items.some((text) => text.includes('Add facility'))).toBe(false);
    expect(items.some((text) => text.includes('Add access point'))).toBe(false);
    expect(mutations()).toHaveLength(0);
  });
});

describe('a production application', () => {
  it('should show and offer every binding, with Suspend and Revoke while active', async () => {
    application = applicationRow({ is_sandbox: false, name: 'Lobby Kiosk', code: 'APP-00001' });
    renderAt(`/client-applications/${APP}`);
    await openTab('Population');
    expect(await screen.findByText('Facilities')).toBeDefined();
    expect(screen.getByText('Access points')).toBeDefined();
    expect(screen.queryByText('Sandbox population: segments')).toBeNull();
    const items = await menuItems();
    for (const label of ['Add segment', 'Add facility', 'Add access point', 'Allow mode', 'Share attribute', 'Suspend', 'Revoke']) {
      expect(items.some((text) => text.includes(label)), label).toBe(true);
    }
    expect(items.some((text) => text.includes('Reactivate'))).toBe(false);
  });

  it('should offer Reactivate, not Suspend, while suspended', async () => {
    application = applicationRow({ is_sandbox: false, status: 'suspended' });
    renderAt(`/client-applications/${APP}`);
    const items = await menuItems();
    expect(items.some((text) => text.includes('Reactivate'))).toBe(true);
    expect(items.some((text) => text.includes('Suspend'))).toBe(false);
  });
});
