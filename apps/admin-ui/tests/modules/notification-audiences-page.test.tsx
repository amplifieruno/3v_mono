// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * Recipient groups, escalation policies and on-call schedules on screen: a policy offers the
 * number of passes only while it repeats (and does not send it otherwise); a schedule says who is
 * on call now and until when, with its rotation in position order; a group lists its people and
 * its external addresses on tabs of their own.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const GROUP = '44444444-4444-4444-8444-000000000001';
const SCHEDULE = '55555555-5555-4555-8555-000000000001';
const ANNA = '66666666-6666-4666-8666-000000000001';
const BORIS = '66666666-6666-4666-8666-000000000002';

const stamps = { created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' };
const USERS = [
  { id: ANNA, displayName: 'Anna Petrova', email: 'anna@example.com' },
  { id: BORIS, displayName: 'Boris Ivanov', email: 'boris@example.com' },
];
const SCHEDULE_ROW = {
  ...stamps,
  id: SCHEDULE,
  name: 'Security on-call',
  description: null,
  timezone: 'UTC',
  shift_length_hours: 12,
  rotation_start_at: '2026-09-17T05:00:00Z',
  on_call_user_id: BORIS,
  shift_ends_at: '2026-10-22T17:00:00Z',
};
const ROTATION = [
  { id: 'm1', schedule_id: SCHEDULE, position: 0, user_id: ANNA, created_at: stamps.created_at },
  { id: 'm2', schedule_id: SCHEDULE, position: 10, user_id: BORIS, created_at: stamps.created_at },
];
const GROUP_ROW = { ...stamps, id: GROUP, name: 'Security team', description: null };
const PEOPLE = [{ id: 'p1', group_id: GROUP, user_id: ANNA, channel: 'email', created_at: stamps.created_at }];
const ADDRESSES = [{ id: 'a1', group_id: GROUP, external_address: '+441632960123', channel: 'sms', created_at: stamps.created_at }];

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

async function serve(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query } = JSON.parse(String(init?.body)) as GraphqlBody;
  if (query.trimStart().startsWith('mutation')) {
    return hasuraResponse({ data: { item: { ...stamps, id: '77777777-7777-4777-8777-000000000001', name: 'P', description: null, repeat: false, max_cycles: null } } });
  }
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 2 } } } });
  if (query.includes('on_call_schedules_by_pk')) return hasuraResponse({ data: { item: SCHEDULE_ROW } });
  if (query.includes('recipient_groups_by_pk')) return hasuraResponse({ data: { item: GROUP_ROW } });
  if (/\bitems: on_call_schedule_members\(/.test(query)) return hasuraResponse({ data: { items: ROTATION } });
  if (/\bitems: recipient_group_members\(/.test(query)) {
    return hasuraResponse({ data: { items: query.includes('external_address') ? ADDRESSES : PEOPLE } });
  }
  if (/\bitems: users\(/.test(query)) return hasuraResponse({ data: { items: USERS } });
  return hasuraResponse({ data: { items: [] } });
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ConsoleApp auth={fakeAdminAuth(NOVA, 'Nova Tower Business Center')} />
    </MemoryRouter>,
  );

beforeAll(installDomShims);

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

describe('escalation policy form', () => {
  it('should offer the number of passes only while the policy repeats', async () => {
    renderAt('/escalation-policies/create');
    const repeat = await screen.findByRole('switch', { name: /^Repeat/ }).catch(() => screen.findByRole('checkbox', { name: /^Repeat/ }));
    expect(screen.queryByLabelText(/^Passes at most/)).toBeNull();
    fireEvent.click(repeat);
    expect(await screen.findByLabelText(/^Passes at most/)).toBeDefined();
    fireEvent.click(repeat);
    await waitFor(() => expect(screen.queryByLabelText(/^Passes at most/)).toBeNull());
  });

  it('should not send the number of passes for a policy that does not repeat', async () => {
    renderAt('/escalation-policies/create');
    fireEvent.change(await screen.findByLabelText(/^Name/), { target: { value: 'Night escalation' } });
    fireEvent.click(screen.getByRole('button', { name: /^(Create|Save)/ }));
    await waitFor(() => expect(mutations().length).toBe(1));
    const sent = JSON.stringify(mutations()[0]?.variables);
    expect(sent).toContain('Night escalation');
    expect(sent).not.toContain('max_cycles');
  });
});

describe('on-call schedule page', () => {
  it('should say who is on call now and until when, with the rotation in position order', async () => {
    renderAt(`/on-call-schedules/${SCHEDULE}`);
    expect(await screen.findByText('On call now')).toBeDefined();
    expect((await screen.findAllByText('Boris Ivanov')).length).toBeGreaterThan(0);
    expect(screen.getByText('Shift ends')).toBeDefined();
    expect(screen.getByRole('tab', { name: /Rotation/ })).toBeDefined();
    const read = bodies().find((body) => /\bitems: on_call_schedule_members\(/.test(body.query));
    expect(`${read?.query ?? ''} ${JSON.stringify(read?.variables)}`).toMatch(/position["\s:]*asc/);
  });
});

describe('recipient group page', () => {
  it('should list the group’s people and its external addresses on tabs of their own', async () => {
    renderAt(`/recipient-groups/${GROUP}`);
    expect(await screen.findByRole('tab', { name: /People/ })).toBeDefined();
    expect(screen.getByRole('tab', { name: /External addresses/ })).toBeDefined();
    expect(await screen.findByText('Anna Petrova')).toBeDefined();
    // Each tab asks for its own kind of member only.
    const reads = bodies().filter((body) => /\bitems: recipient_group_members\(/.test(body.query));
    expect(reads.some((body) => JSON.stringify(body.variables).includes('user_id'))).toBe(true);
  });
});
