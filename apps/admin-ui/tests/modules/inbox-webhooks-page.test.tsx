// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * The inbox and webhooks on screen: the header bell counts the unread notifications and lists the
 * latest; "Mark all read" sends `mark_notifications_read` without ids (the server picks the
 * signed-in member's rows); "Acknowledge" sends `acknowledge_notification` and the inbox is read
 * again. A webhook form refuses a link-local address and a missing secret before sending, warns
 * about a private address but saves it, and an edit offers no removal of the stored secret.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const NOTE = '99999999-9999-4999-8999-000000000001';
const HOOK = '77777777-7777-4777-8777-000000000001';
const INCIDENT = '55555555-5555-4555-8555-000000000001';

interface GraphqlBody {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
}

const bodies = (): GraphqlBody[] =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).includes('graphql'))
    .map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody);
const mutations = (): GraphqlBody[] => bodies().filter((body) => body.query.trimStart().startsWith('mutation'));
const incidentReads = (): GraphqlBody[] => bodies().filter((body) => /\bincidents(_by_pk)?\(/.test(body.query));
const summaries = (): GraphqlBody[] => bodies().filter((body) => body.query.includes('query InboxSummary'));

const NOTE_ROW = {
  id: NOTE,
  created_at: '2026-10-22T08:00:00Z',
  title: 'Escalation 1: INCIDENT-00042 Blacklist match',
  body: 'Nobody acknowledged INCIDENT-00042 yet.',
  priority: 'critical',
  read_at: null,
  acknowledged_at: null,
  event_id: null,
  incident_id: INCIDENT,
  delivery_id: null,
};

const HOOK_ROW = {
  id: HOOK,
  url: 'https://siem.example.com/hooks/itap',
  description: 'SIEM',
  is_active: true,
  last_delivery_status: 'sent',
  last_delivery_at: '2026-10-22T08:00:00Z',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};

async function serve(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query } = JSON.parse(String(init?.body)) as GraphqlBody;
  if (query.includes('mark_notifications_read')) return hasuraResponse({ data: { mark_notifications_read: [{ id: NOTE }, { id: 'x' }] } });
  if (query.includes('acknowledge_notification')) {
    return hasuraResponse({ data: { acknowledge_notification: [{ id: NOTE, read_at: '2026-10-22T09:00:00Z', acknowledged_at: '2026-10-22T09:00:00Z' }] } });
  }
  if (query.trimStart().startsWith('mutation')) return hasuraResponse({ data: { item: HOOK_ROW } });
  if (query.includes('query InboxSummary')) {
    return hasuraResponse({ data: { unread: { aggregate: { count: 3 } }, latest: [NOTE_ROW] } });
  }
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 1 } } } });
  if (query.includes('user_notifications_by_pk')) return hasuraResponse({ data: { item: NOTE_ROW } });
  if (query.includes('user_notifications(')) return hasuraResponse({ data: { items: [NOTE_ROW] } });
  if (query.includes('webhook_subscriptions_by_pk')) return hasuraResponse({ data: { item: HOOK_ROW } });
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
  Element.prototype.scrollIntoView ??= () => undefined;
  Element.prototype.hasPointerCapture ??= () => false;
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

describe('header bell', () => {
  it('should count the unread notifications and list the latest with a link to the inbox', async () => {
    renderAt('/webhooks');
    expect((await screen.findByTestId('inbox-bell:count')).textContent).toBe('3');
    const bell = screen.getByTestId('inbox-bell');
    expect(bell.getAttribute('aria-label')).toBe('Notifications: 3 unread');
    fireEvent.keyDown(bell, { key: 'Enter' });
    const item = await screen.findByTestId('inbox-bell:item');
    expect(item.textContent).toContain('INCIDENT-00042');
    expect(item.getAttribute('href')).toBe(`/inbox/${NOTE}`);
    expect(screen.getByTestId('inbox-bell:open').getAttribute('href')).toBe('/inbox');
  });
});

describe('inbox', () => {
  it('should mark all read without naming any notification (the server takes the signed-in member’s)', async () => {
    renderAt('/inbox');
    expect(await screen.findByRole('row', { name: /INCIDENT-00042/ })).toBeDefined();
    await waitFor(() => expect(summaries().length).toBeGreaterThan(0));
    fireEvent.click(await screen.findByRole('button', { name: 'Mark all read' }));
    const confirm = await screen.findByRole('dialog');
    const before = summaries().length;
    fireEvent.click(within(confirm).getByRole('button', { name: /Mark all read|Confirm|Continue/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    expect(mutations()[0]?.query).toContain('mark_notifications_read(args: { p_ids: null })');
    expect(mutations()[0]?.variables ?? {}).toEqual({});
    // The bell reads the inbox again (the mutation's effect on the inbox).
    await waitFor(() => expect(summaries().length).toBeGreaterThan(before));
    expect(await screen.findByText('Marked read: 2.')).toBeDefined();
  });

  it('should acknowledge a notification through acknowledge_notification and read the inbox again', async () => {
    renderAt(`/inbox/${NOTE}`);
    const acknowledge = await screen.findByRole('button', { name: 'Acknowledge' });
    await waitFor(() => expect(incidentReads().length).toBeGreaterThan(0));
    const before = { summaries: summaries().length, incidents: incidentReads().length };
    fireEvent.click(acknowledge);
    await waitFor(() => expect(mutations()).toHaveLength(1));
    expect(mutations()[0]?.query).toContain('acknowledge_notification');
    expect(mutations()[0]?.variables).toEqual({ notification: NOTE });
    // The bell and the incident (an escalation page acknowledges it on the server) are read again.
    await waitFor(() => expect(summaries().length).toBeGreaterThan(before.summaries));
    await waitFor(() => expect(incidentReads().length).toBeGreaterThan(before.incidents));
  });
});

describe('webhook form', () => {
  const urlBox = async () => screen.findByRole('textbox', { name: /^URL/ });

  it('should refuse a link-local address and a missing secret before sending anything', async () => {
    renderAt('/webhooks/create');
    fireEvent.change(await urlBox(), { target: { value: 'http://169.254.169.254/latest' } });
    fireEvent.click(await screen.findByRole('button', { name: /^(Create|Save)/ }));
    expect(await screen.findByText(/Link-local and cloud metadata addresses/)).toBeDefined();
    expect(await screen.findByText(/Enter a secret: a new record needs one/)).toBeDefined();
    expect(mutations()).toHaveLength(0);
  });

  it('should warn about a private address but save it with the typed secret', async () => {
    renderAt('/webhooks/create');
    const url = await urlBox();
    fireEvent.change(url, { target: { value: 'http://10.0.0.5:8080/hook' } });
    fireEvent.blur(url);
    fireEvent.change(screen.getByLabelText(/^Signing secret/), { target: { value: 's3cret-s3cret-s3cret' } });
    expect(await screen.findByText(/A loopback or private network address/)).toBeDefined();
    fireEvent.click(await screen.findByRole('button', { name: /^(Create|Save)/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    expect(mutations()[0]?.variables?.object).toMatchObject({ url: 'http://10.0.0.5:8080/hook', secret: 's3cret-s3cret-s3cret' });
  });

  it('should keep the stored secret on an edit and offer no removal of it', async () => {
    renderAt(`/webhooks/${HOOK}/edit`);
    const description = await screen.findByRole('textbox', { name: /^Description/ });
    expect(screen.queryByTestId(/secret.*:remove/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove the stored value' })).toBeNull();
    fireEvent.change(description, { target: { value: 'SIEM forwarder' } });
    fireEvent.click(await screen.findByRole('button', { name: /^(Create|Save)/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    const sent = JSON.stringify(mutations()[0]?.variables);
    expect(sent).toContain('SIEM forwarder');
    expect(sent).not.toContain('secret');
  });
});
