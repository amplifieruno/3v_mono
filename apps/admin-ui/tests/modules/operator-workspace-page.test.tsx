// @vitest-environment jsdom
import { cleanup, configure, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * The operator workspace page laid out by the operator's own workspace (panels shown and their
 * order from `operator_workspaces.layout`, every panel without one), a handover's page listing
 * the incidents handed over with their status now (plan 05 Review Focus 5), and a person's
 * Watch lists tab, over a fake Hasura.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const HANDOVER = '88888888-8888-4888-8888-000000000001';
const INCIDENT = '77777777-7777-4777-8777-000000000001';
const ANNA = '55555555-5555-4555-8555-000000000001';

interface GraphqlBody {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
}

let workspaces: unknown[] = [];

const bodies = (): GraphqlBody[] =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).includes('graphql'))
    .map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody);

async function serve(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query } = JSON.parse(String(init?.body)) as GraphqlBody;
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 1 } } } });
  if (query.includes('OperatorWorkspaceLayout')) return hasuraResponse({ data: { operator_workspaces: workspaces } });
  if (query.includes('shift_handovers_by_pk')) {
    return hasuraResponse({
      data: {
        item: {
          id: HANDOVER,
          from_user_id: 'u-from',
          to_user_id: 'u-to',
          shift_started_at: '2026-10-22T06:00:00Z',
          shift_ended_at: '2026-10-22T14:00:00Z',
          summary: 'Lobby camera flickers.',
          acknowledged_at: '2026-10-22T14:05:00Z',
          addressed_to_me: false,
          sent_by_me: false,
          created_at: '2026-10-22T13:55:00Z',
          updated_at: '2026-10-22T14:05:00Z',
        },
      },
    });
  }
  if (/\bitems: shift_handover_incidents\(/.test(query)) {
    return hasuraResponse({
      data: {
        items: [
          {
            id: 'link-1',
            handover_id: HANDOVER,
            incident_id: INCIDENT,
            created_at: '2026-10-22T13:56:00Z',
            // The provider reads the dotted columns across the `incident` relationship under an alias.
            buro_rel_0: { title: 'Loitering in the lobby', status: 'investigating', severity: 'high' },
          },
        ],
      },
    });
  }
  if (query.includes('profiles_by_pk')) {
    return hasuraResponse({
      data: { item: { id: ANNA, code: 'PROFILE-00001', profile_type: 'employee', first_name: 'Anna', last_name: 'Petrova', status: 'active', erased_at: null, processing_restricted: false } },
    });
  }
  if (/\bitems: incidents\(/.test(query)) {
    return hasuraResponse({ data: { items: [{ id: INCIDENT, code: 'INCIDENT-00042', title: 'Loitering in the lobby' }] } });
  }
  return hasuraResponse({ data: { items: [] } });
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ConsoleApp auth={fakeAdminAuth(NOVA, 'Nova Tower Business Center')} />
    </MemoryRouter>,
  );

/** The panel titles of the workspace page, top to bottom. */
const panelTitles = (): string[] =>
  ['Live cameras', 'Open incidents', 'Latest critical events', 'Occupancy']
    .flatMap((title) => screen.queryAllByText(title, { exact: true }).map((node) => ({ title, node })))
    .sort((a, b) => (a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    .map(({ title }) => title);

configure({ asyncUtilTimeout: 5000 });

beforeAll(installDomShims);

beforeEach(() => {
  localStorage.clear();
  workspaces = [];
  vi.stubGlobal('fetch', vi.fn(serve));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('operator workspace page', () => {
  it('should show every panel in the default order when the operator has no workspace', async () => {
    renderAt('/workspace');
    await screen.findByText('Arrange this page');
    await waitFor(() => expect(panelTitles()).toEqual(['Live cameras', 'Open incidents', 'Latest critical events', 'Occupancy']));
  });

  it('should show only the panels of the default workspace, in its order', async () => {
    workspaces = [{ id: 'w1', name: 'Night desk', layout: { panels: ['events', 'incidents'] } }];
    renderAt('/workspace');
    await waitFor(() => expect(panelTitles()).toEqual(['Latest critical events', 'Open incidents']));
    // Open incidents are read by status; critical events by severity.
    await waitFor(() => {
      const incidents = bodies().find((body) => /\bitems: incidents\(/.test(body.query));
      expect(JSON.stringify(incidents?.variables)).toContain('"_in":["open","acknowledged","investigating"]');
      const events = bodies().find((body) => /\bitems: events\(/.test(body.query));
      expect(JSON.stringify(events?.variables)).toContain('"_in":["critical"]');
    });
  });
});

describe('shift handover page (Review Focus 5)', () => {
  it('should list the incidents handed over with their status now', async () => {
    renderAt(`/shift-handovers/${HANDOVER}`);
    const panel = (await screen.findByText('Incidents handed over')).closest('section') ?? document.body;
    expect(await within(panel as HTMLElement).findByText('Loitering in the lobby')).toBeDefined();
    expect(within(panel as HTMLElement).getByText('Investigating')).toBeDefined();
    const read = bodies().find((body) => /\bitems: shift_handover_incidents\(/.test(body.query));
    expect(JSON.stringify(read?.variables)).toContain(HANDOVER);
  });
});

describe('a person’s watch lists', () => {
  it('should list the profile’s entries by the profile', async () => {
    renderAt(`/profiles/${ANNA}?sections=watch-lists`);
    await waitFor(() => {
      const read = bodies().find((body) => /\bitems: watch_list_entries\(/.test(body.query));
      expect(JSON.stringify(read?.variables)).toContain(`"profile_id":{"_eq":"${ANNA}"}`);
    });
  });
});
