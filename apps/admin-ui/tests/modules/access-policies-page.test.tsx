// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * Access policies on screen: the member who submitted a version sees Approve disabled with the
 * four-eyes reason (Review Focus 1) and a pending version frozen (no edit, its subjects read only);
 * another member's version shows what goes in force before Approve; a draft lists its subjects
 * per kind; the simulation shows the decisions the version would change and sends no mutation
 * (Review Focus 2); the policy analytics page reads its period.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const POLICY = '22222222-2222-4222-8222-000000000001';
const VERSION = '33333333-3333-4333-8333-000000000001';
const PERSON = '44444444-4444-4444-8444-000000000001';
const DOOR = '55555555-5555-4555-8555-000000000001';
const SIGNED_IN = 'user-1';
const SECOND = '66666666-6666-4666-8666-000000000001';

const versionRow = (status: string, submittedBy: string | null) => ({
  id: VERSION,
  policy_id: POLICY,
  version: 3,
  status,
  effect: 'allow',
  priority: 100,
  schedule: [{ days: [1, 2, 3, 4, 5], from: '06:00', to: '22:00' }],
  valid_from: null,
  valid_until: null,
  max_risk: 0.5,
  submitted_by: submittedBy,
  submitted_at: submittedBy === null ? null : '2026-10-22T09:00:00Z',
  approved_by: null,
  approved_at: null,
  rejection_reason: null,
  rejected_by: null,
  rejected_at: null,
  published_at: null,
  created_at: '2026-10-22T08:00:00Z',
  updated_at: '2026-10-22T09:00:00Z',
});
const POLICY_ROW = { id: POLICY, code: 'POL-00007', name: 'Lab access', description: null, is_archived: false, current_version_id: null };
const SUBJECT_ROW = { id: '77777777-7777-4777-8777-000000000001', version_id: VERSION, profile_id: null, segment_id: null, profile_type: 'employee', access_level: null, created_at: '2026-10-22T08:00:00Z' };

const SIMULATION = {
  version_id: VERSION,
  policy_id: POLICY,
  period_from: '2026-10-15T00:00:00Z',
  period_to: '2026-10-22T00:00:00Z',
  decisions_in_period: 120,
  evaluated: 120,
  sampled: false,
  unchanged: 117,
  granted_to_denied: 2,
  denied_to_granted: 1,
  reason_changed: 0,
  skipped: 0,
  drifted: 4,
  samples: [
    {
      decision_id: '88888888-8888-4888-8888-000000000001',
      decided_at: '2026-10-20T07:30:00Z',
      access_point_id: DOOR,
      identity_id: null,
      profile_id: PERSON,
      old_result: 'granted',
      old_reason: 'policy_allow',
      new_result: 'denied',
      new_reason: 'outside_schedule',
      recorded_result: 'granted',
      recorded_reason: 'policy_allow',
      drift: false,
    },
  ],
};

const ANALYTICS = {
  decisions: 40,
  granted: 30,
  denied: 10,
  versions: [
    { version_id: VERSION, policy_id: POLICY, policy_code: 'POL-00007', policy_name: 'Lab access', version: 3, status: 'published', effect: 'allow', priority: 100, enforced: true, hits: 30, granted: 30, denied: 0, last_hit_at: '2026-10-22T08:00:00Z' },
  ],
  unused_versions: [],
  denial_reasons: [{ reason: 'no_rule', count: 10 }],
  top_denied: [{ profile_id: PERSON, access_point_id: DOOR, denied: 6, last_denied_at: '2026-10-22T07:00:00Z' }],
  overlap_hints: [],
  grants: { total: 2, used: 1, revoked: 0, expired: 1, unused: 0 },
  complexity: { enforced_policies: 1, subjects: 1, targets: 1, schedules: 1, max_risk: 1, avg_subjects: 1, avg_targets: 1 },
};

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

let version = versionRow('pending_approval', SIGNED_IN);

async function serve(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query } = JSON.parse(String(init?.body)) as GraphqlBody;
  if (query.includes('simulate_access_policy(')) return hasuraResponse({ data: { simulate_access_policy: [SIMULATION] } });
  if (query.includes('policy_analytics(')) return hasuraResponse({ data: { policy_analytics: [ANALYTICS] } });
  if (query.includes('AccessNames')) {
    return hasuraResponse({
      data: { profiles: [{ id: PERSON, code: 'P-1', first_name: 'Ada', last_name: 'Byron' }], access_points: [{ id: DOOR, name: 'Lab door' }], identities: [] },
    });
  }
  if (query.includes('AccessPolicyVersionContent')) {
    return hasuraResponse({
      data: {
        access_policy_versions_by_pk: {
          ...version,
          policy: { code: 'POL-00007', name: 'Lab access' },
          access_policy_version_subjects: [{ profile: null, segment: null, profile_type: 'employee', access_level: null }],
          access_policy_version_targets: [{ facility: null, area: { name: 'Lab' }, access_point: null }],
        },
      },
    });
  }
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 1 } } } });
  if (query.includes('access_policy_versions_by_pk')) return hasuraResponse({ data: { item: version } });
  if (query.includes('access_policies_by_pk')) return hasuraResponse({ data: { item: POLICY_ROW } });
  if (/\bitems: access_policy_version_subjects\(/.test(query)) return hasuraResponse({ data: { items: [SUBJECT_ROW] } });
  if (/\bitems: access_policies\(/.test(query)) return hasuraResponse({ data: { items: [POLICY_ROW] } });
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

beforeAll(() => {
  installDomShims();
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => undefined;
});

beforeEach(() => {
  version = versionRow('pending_approval', SIGNED_IN);
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(serve));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('four-eyes and frozen versions (Review Focus 1)', () => {
  it('should not let the submitter approve, and keep a pending version frozen', async () => {
    renderAt(`/access-policy-versions/${VERSION}`);
    const approve = await screen.findByRole('button', { name: /^Approve/ });
    expect(approve.getAttribute('aria-disabled')).toBe('true');
    // The reason is the disabled button's tooltip.
    fireEvent.focus(approve);
    expect((await screen.findAllByText(/another member must approve it \(four-eyes rule\)/)).length).toBeGreaterThan(0);
    // A click on it opens nothing.
    fireEvent.click(approve);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Submit for approval/ })).toBeNull();
    await openTab('Who');
    expect(await screen.findByText('Employee')).toBeDefined();
    // Frozen: the whole set read only, no per-kind lists to add to.
    expect(screen.queryByText('Minimum access levels')).toBeNull();
    expect(mutations()).toHaveLength(0);
  });

  it('should show another member’s version before approving it', async () => {
    version = versionRow('pending_approval', SECOND);
    renderAt(`/access-policy-versions/${VERSION}`);
    const approve = await screen.findByRole('button', { name: /^Approve/ });
    await waitFor(() => expect(approve.hasAttribute('disabled')).toBe(false));
    fireEvent.click(approve);
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/Approving puts this version in force at once/)).toBeDefined();
    expect(await within(dialog).findByText('Profile type: Employee')).toBeDefined();
    expect(within(dialog).getByText('Area: Lab (and the areas inside it)')).toBeDefined();
    expect(mutations()).toHaveLength(0);
  });

  it('should list a draft’s subjects per kind, ready to add', async () => {
    version = versionRow('draft', null);
    renderAt(`/access-policy-versions/${VERSION}`);
    await openTab('Who');
    expect(await screen.findByText('Minimum access levels')).toBeDefined();
    expect(screen.getByText('Profile types')).toBeDefined();
  });
});

describe('simulation (Review Focus 2)', () => {
  it('should show the decisions the version would change and write nothing', async () => {
    renderAt(`/access-policy-versions/${VERSION}`);
    fireEvent.click(await screen.findByRole('button', { name: /^Simulate/ }));
    const summary = await screen.findByTestId('simulation-summary');
    expect(summary.textContent).toContain('2 would be denied instead of granted, 1 granted instead of denied');
    expect(screen.getByText(/4 decisions would come out differently today even without this version/)).toBeDefined();
    const row = (await screen.findAllByTestId('simulation-sample'))[0]!;
    expect(row.getAttribute('data-change')).toBe('granted-denied');
    expect(await within(row).findByRole('link', { name: 'Ada Byron' })).toBeDefined();
    expect(within(row).getByRole('link', { name: 'Lab door' })).toBeDefined();
    expect(within(row).getByText('Outside schedule')).toBeDefined();
    expect(mutations()).toHaveLength(0);
  });
});

describe('policy analytics', () => {
  it('should show the figures and the detail of the period', async () => {
    renderAt('/policy-analytics');
    const detail = await screen.findByTestId('policy-analytics');
    expect(within(detail).getByRole('link', { name: 'POL-00007 Lab access' })).toBeDefined();
    expect(within(detail).getByText('No matching rule')).toBeDefined();
    expect(await within(detail).findByRole('link', { name: 'Ada Byron' })).toBeDefined();
    const policy_analytics = bodies().find((body) => body.query.includes('policy_analytics('));
    expect(Object.keys(policy_analytics?.variables ?? {}).sort()).toEqual(['from', 'to']);
  });
});
