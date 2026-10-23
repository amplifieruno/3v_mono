// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * Grants and decisions on screen: a decision's page shows how the door decided as steps with
 * names, not raw JSON (Review Focus 5); a single-use grant reads Unused or Used and offers Revoke
 * only, never Edit (Review Focus 4); "Test access" on an access point says what a test records.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const DECISION = '22222222-2222-4222-8222-000000000001';
const PERSON = '44444444-4444-4444-8444-000000000001';
const DOOR = '55555555-5555-4555-8555-000000000001';
const VERSION_DENY = '33333333-3333-4333-8333-000000000001';
const VERSION_ALLOW = '33333333-3333-4333-8333-000000000002';
const GRANT = '66666666-6666-4666-8666-000000000001';
const AREA = '77777777-7777-4777-8777-000000000001';

const DECISION_ROW = {
  id: DECISION,
  result: 'denied',
  reason: 'risk_exceeded',
  risk_score: 0.7,
  decided_at: '2026-10-22T07:30:00Z',
  access_point_id: DOOR,
  profile_id: PERSON,
  identity_id: null,
  policy_version_id: VERSION_ALLOW,
  grant_id: null,
  override_id: null,
  facility_id: null,
  device_id: null,
  detection_id: null,
  epoch: 12,
  latency_ms: 1.2,
};
const SIGNALS = {
  decided_by: 'policy',
  epoch: 12,
  timezone: 'Europe/Moscow',
  person: { profile_id: PERSON, identity_id: null, profile_status: 'active', profile_type: 'contractor', access_level: 'basic' },
  overrides: [],
  candidates: [
    { version_id: VERSION_DENY, effect: 'deny', priority: 400, subject: null, target: 'access_point', valid: true, schedule: 'always', decided: false },
    { version_id: VERSION_ALLOW, effect: 'allow', priority: 100, max_risk: 0.5, subject: 'segment', target: 'area', valid: true, schedule: 'in', decided: true },
  ],
  grants: [],
  signals: { recent_denials: 2, device_health: 'healthy', ignored_device_id: null, areas_over_capacity: [{ area_id: AREA, occupancy: 30, capacity: 20 }] },
  risk: { score: 0.7, components: { unknown_identity: 0, recent_denials: 0.3, over_capacity: 0.3, device_health: 0 } },
};

const grantRow = (extra: Record<string, unknown>) => ({
  id: GRANT,
  profile_id: PERSON,
  area_id: null,
  access_point_id: DOOR,
  valid_from: '2026-10-22T07:00:00Z',
  valid_until: '2999-01-01T00:00:00Z',
  single_use: true,
  used_at: null,
  reason: 'Delivery',
  granted_by: null,
  created_at: '2026-10-22T07:00:00Z',
  revoked_at: null,
  revoked_by: null,
  revoke_reason: null,
  ...extra,
});

interface GraphqlBody {
  readonly query: string;
}

const mutations = () =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).includes('graphql'))
    .map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody)
    .filter((body) => body.query.trimStart().startsWith('mutation'));

let grant = grantRow({});

async function serve(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query } = JSON.parse(String(init?.body)) as GraphqlBody;
  if (query.includes('AccessDecisionTrace')) {
    return hasuraResponse({
      data: {
        access_decisions_by_pk: {
          ...DECISION_ROW,
          signals: SIGNALS,
          access_point: { name: 'Lab door' },
          profile: { code: 'P-1', first_name: 'Ada', last_name: 'Byron' },
          identity: null,
        },
      },
    });
  }
  if (query.includes('AccessTraceNames')) {
    return hasuraResponse({
      data: {
        access_policy_versions: [
          { id: VERSION_DENY, version: 2, policy: { code: 'POL-00002', name: 'Contractors out' } },
          { id: VERSION_ALLOW, version: 3, policy: { code: 'POL-00007', name: 'Lab access' } },
        ],
        areas: [{ id: AREA, name: 'Lab wing' }],
      },
    });
  }
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 1 } } } });
  if (query.includes('access_decisions_by_pk')) return hasuraResponse({ data: { item: DECISION_ROW } });
  if (query.includes('access_grants_by_pk')) return hasuraResponse({ data: { item: grant } });
  if (query.includes('access_points_by_pk')) {
    return hasuraResponse({ data: { item: { id: DOOR, name: 'Lab door', facility_id: NOVA, area_id: AREA, kind: 'door', direction: 'both', status: 'active' } } });
  }
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
  grant = grantRow({});
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(serve));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a decision’s trace (Review Focus 5)', () => {
  it('should show how the door decided as steps with names', async () => {
    renderAt(`/access-decisions/${DECISION}`);
    const trace = await screen.findByTestId('decision-trace');
    const headline = await within(trace).findByTestId('trace-headline');
    expect(within(headline).getByText('Risk too high')).toBeDefined();
    expect(within(headline).getByRole('link', { name: 'Ada Byron' })).toBeDefined();
    expect(within(headline).getByRole('link', { name: 'Lab door' })).toBeDefined();
    expect(within(trace).getByTestId('trace-decided-by').textContent).toMatch(/first policy that names the person/);
    expect(within(trace).getByTestId('trace-person').textContent).toContain('Profile active, contractor, access level basic');
    const rows = await within(trace).findAllByTestId('trace-policy');
    expect(rows.map((row) => row.getAttribute('data-outcome'))).toEqual(['notThePerson', 'decided']);
    expect(await within(rows[1]!).findByRole('link', { name: 'POL-00007 Lab access, version 3' })).toBeDefined();
    expect(within(rows[1]!).getByText('Through a segment')).toBeDefined();
    expect(within(rows[1]!).getByText('max risk 0.50')).toBeDefined();
    expect(within(rows[0]!).getByText('Does not name the person')).toBeDefined();
    const risk = within(trace).getByTestId('trace-risk');
    expect(risk.textContent).toContain('Risk 0.70');
    expect(await within(risk).findByText('Over capacity (Lab wing): +0.30')).toBeDefined();
    expect(within(risk).getByText('Denied 2 times in the 10 minutes before: +0.30')).toBeDefined();
    expect(trace.textContent).not.toContain('"decided_by"');
    expect(mutations()).toHaveLength(0);
  });
});

describe('grants: used or unused, revoked not edited (Review Focus 4)', () => {
  it('should show an unused single-use grant with Revoke and no Edit', async () => {
    renderAt(`/access-grants/${GRANT}`);
    expect((await screen.findAllByText('Unused')).length).toBeGreaterThan(0);
    expect(await screen.findByRole('button', { name: /^Revoke/ })).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Edit/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /^Edit/ })).toBeNull();
  });

  it('should show a used single-use grant as used, with nothing left to revoke', async () => {
    grant = grantRow({ used_at: '2026-10-22T08:00:00Z' });
    renderAt(`/access-grants/${GRANT}`);
    expect((await screen.findAllByText('Used')).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.queryByText('Unused')).toBeNull());
    expect(screen.queryByRole('button', { name: /^Revoke/ })).toBeNull();
  });
});

describe('Test access', () => {
  it('should say what a test records before anything is sent', async () => {
    renderAt(`/access-points/${DOOR}`);
    fireEvent.click(await screen.findByRole('button', { name: /^Test access/ }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/This records a real decision/)).toBeDefined();
    expect(mutations()).toHaveLength(0);
  });
});
