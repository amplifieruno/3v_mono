// @vitest-environment jsdom
import { cleanup, configure, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * Event and event rule screens over a fake Hasura: the event list (no count query, newest first,
 * severity badges), a rule's incidents read by the rule, a draft version's scope can be added to
 * while a published version's scope is read only, and a draft of an unusual-dwell rule edits its
 * dwell time.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const RULE = '22222222-2222-4222-8222-000000000001';
const DRAFT = '33333333-3333-4333-8333-000000000001';
const PUBLISHED = '33333333-3333-4333-8333-000000000002';
const LOBBY = '44444444-4444-4444-8444-000000000001';

const EVENTS = [
  {
    id: '55555555-5555-4555-8555-000000000001',
    occurred_at: '2026-10-22T10:05:00Z',
    severity: 'critical',
    event_type: 'blacklist_match',
    title: 'Blacklist match in Lobby',
    facility_id: null,
    area_id: LOBBY,
    access_point_id: null,
    device_id: null,
    identity_id: null,
    profile_id: null,
    rule_version_id: PUBLISHED,
    session_id: null,
    detection_id: null,
    access_decision_id: null,
    authentication_attempt_id: null,
    payload: {},
    dedup_key: 'k1',
    created_at: '2026-10-22T10:05:01Z',
  },
];

const RULE_ROW = {
  id: RULE,
  code: 'RULE-00001',
  name: 'Long wait in the lobby lounge',
  description: null,
  rule_type: 'unusual_dwell',
  is_enabled: true,
  current_version_id: PUBLISHED,
  last_triggered_at: null,
  trigger_count: 3,
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
};

const versionRow = (id: string, version: number, status: string) => ({
  id,
  rule_id: RULE,
  version,
  status,
  rule_type: 'unusual_dwell',
  parameters: { dwell_seconds: 2400 },
  severity: 'low',
  creates_incident: false,
  escalation_policy_id: null,
  published_by: null,
  published_at: status === 'draft' ? null : '2026-10-01T10:00:00Z',
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
});

const VERSIONS: Record<string, unknown> = {
  [DRAFT]: versionRow(DRAFT, 2, 'draft'),
  [PUBLISHED]: versionRow(PUBLISHED, 1, 'published'),
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

async function serve(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query, variables } = JSON.parse(String(init?.body)) as GraphqlBody;
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 1 } } } });
  if (/\bitems: events\(/.test(query)) return hasuraResponse({ data: { items: EVENTS } });
  if (query.includes('event_rules_by_pk')) return hasuraResponse({ data: { item: RULE_ROW } });
  if (/\bitems: event_rules\(/.test(query)) return hasuraResponse({ data: { items: [RULE_ROW] } });
  if (query.includes('event_rule_versions_by_pk')) {
    return hasuraResponse({ data: { item: VERSIONS[String(variables?.id)] ?? null } });
  }
  if (/\bitems: event_rule_versions\(/.test(query)) return hasuraResponse({ data: { items: Object.values(VERSIONS) } });
  if (/\bitems: areas\(/.test(query)) return hasuraResponse({ data: { items: [{ id: LOBBY, name: 'Lobby' }] } });
  if (/\bitems: event_rule_version_scopes\(/.test(query)) {
    return hasuraResponse({
      data: { items: [{ id: 's1', version_id: DRAFT, facility_id: null, area_id: LOBBY, segment_id: null, created_at: '2026-10-01T10:00:00Z' }] },
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

configure({ asyncUtilTimeout: 5000 });

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

describe('event list', () => {
  it('should list events newest first with their severity, without a count query', async () => {
    renderAt('/events');
    const title = await screen.findByText('Blacklist match in Lobby');
    const row = title.closest('tr') as HTMLElement;
    expect(within(row).getByText('Critical')).toBeDefined();
    // A live list: the operator sees it refresh and can pause it.
    expect(screen.getByText(/Auto-refresh/)).toBeDefined();
    const read = bodies().find((body) => /\bitems: events\(/.test(body.query));
    expect(read?.query).toContain('occurred_at');
    expect(bodies().some((body) => body.query.includes('events_aggregate'))).toBe(false);
  });
});

describe('event rule pages', () => {
  it('should list the incidents a rule opened by the rule', async () => {
    renderAt(`/event-rules/${RULE}?sections=incidents`);
    await waitFor(() => {
      const read = bodies().find((body) => /\bitems: incidents\(/.test(body.query));
      expect(JSON.stringify(read?.variables)).toContain(`"rule_id":{"_eq":"${RULE}"}`);
    });
  });

  it('should let places be added to a draft’s scope but not to a published version’s', async () => {
    renderAt(`/event-rule-versions/${DRAFT}?sections=scope`);
    expect(await screen.findByRole('button', { name: /create/i })).toBeDefined();
    cleanup();
    renderAt(`/event-rule-versions/${PUBLISHED}?sections=scope`);
    await waitFor(() =>
      expect(
        bodies().some(
          (body) => /\bitems: event_rule_version_scopes\(/.test(body.query) && JSON.stringify(body.variables).includes(PUBLISHED),
        ),
      ).toBe(true),
    );
    expect(screen.queryByRole('button', { name: /create/i })).toBeNull();
  });

  it('should edit an unusual-dwell draft’s dwell time in minutes', async () => {
    renderAt(`/event-rule-versions/${DRAFT}/edit`);
    const box = (await screen.findByLabelText(/Dwell time/)) as HTMLInputElement;
    expect(box.value).toBe('40');
  });
});
