// @vitest-environment jsdom
import { renderBlock } from '@burojs/testing/react';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import type * as React from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRuntime } from '../../src/app/runtime';
import { LIVE_CAMERA_TEXTS } from '../../src/blocks/live-camera/live-camera-texts';
import { LIVE_WALL_REFRESH_MS } from '../../src/blocks/live-camera/live-wall-block';
import { liveWallView } from '../../src/blocks/live-camera/views';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * The `itap:live-wall` block over a fake Hasura: one tile per camera running recognition, named
 * with a link to its page and its area; a note when there is none; the camera list read again while
 * the wall is open; the alert feed, and the red ring on the tile of a camera that just saw a high
 * or critical alert. The player and the socket client are stubbed.
 */

vi.mock('../../src/blocks/live-camera/hls-player', () => ({
  attachHlsStream: async () => ({ destroy: () => undefined }),
}));

/** Connections the wall opened and the rooms joined on them (hoisted with the mock). */
const sockets = vi.hoisted(() => ({ opened: 0, joins: [] as string[] }));

vi.mock('../../src/realtime/socket-io', () => ({
  loadSocketIoFactory: async () => () => {
    sockets.opened += 1;
    let connect: () => void = () => undefined;
    // The server accepts the connection on the next tick.
    setTimeout(() => connect(), 0);
    return {
      onConnect: (handler: () => void) => void (connect = handler),
      onConnectError: () => undefined,
      onDisconnect: () => undefined,
      onDetection: () => undefined,
      join: (deviceId: string, ack: (result: unknown) => void) => {
        sockets.joins.push(deviceId);
        ack({ ok: true });
      },
      leave: () => undefined,
      close: () => undefined,
    };
  },
}));

const ORG = '11111111-1111-4111-8111-111111111111';
const camera = (n: number, name: string) => ({
  id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`,
  name,
  stream_url: `rtsp://mediamtx:8554/${name.toLowerCase()}`,
  recognition_enabled: true,
});

function Wrapper({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  return (
    <MemoryRouter>
      <AppRuntime auth={fakeAdminAuth(ORG, 'Nova')} initialOrganizationId={ORG}>
        {children}
      </AppRuntime>
    </MemoryRouter>
  );
}

/** The cameras the fake Hasura answers, and how many it says there are. */
let served: { rows: unknown[]; total: number } = { rows: [], total: 0 };
/** The events the fake Hasura answers (the alert feed). */
let events: unknown[] = [];

/** An event row as Hasura answers the feed's read: the device name and face file come as relation aliases. */
const event = (id: string, type: string, severity: string, deviceId: string, secondsAgo: number) => ({
  id: `eeeeeeee-eeee-4eee-8eee-${id.padStart(12, '0')}`,
  occurred_at: new Date(Date.now() - secondsAgo * 1000).toISOString(),
  severity,
  event_type: type,
  title: `${type} seen`,
  device_id: deviceId,
  buro_rel_0: { name: 'Entrance' },
  buro_rel_1: null,
});

const deviceReads = () =>
  vi
    .mocked(fetch)
    .mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as { query: string; variables?: unknown })
    .filter((body) => /\bitems: devices\(/.test(body.query));

async function serve(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query } = JSON.parse(String(init?.body)) as { query: string };
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: served.total } } } });
  if (/\bitems: devices\(/.test(query)) return hasuraResponse({ data: { items: served.rows } });
  if (/\bitems: events\(/.test(query)) return hasuraResponse({ data: { items: events } });
  return hasuraResponse({ data: { items: [] } });
}

const render = (cameras: { rows: unknown[]; total: number }, props: { alerts?: boolean } = {}) => {
  served = cameras;
  return renderBlock(liveWallView, {
    wrapper: Wrapper,
    props,
    messages: {
      none: 'No camera runs recognition here.',
      truncated: 'Showing the first {{shown}} of {{total}} cameras.',
      loadingCameras: 'Reading the cameras…',
      camerasFailed: 'The cameras could not be read.',
      cameras: '{{count}} cameras live',
      live: 'Live',
      inView: '{{count}} in view',
      noArea: 'No area set',
      alerts: 'Alerts, last hour',
      alertsNone: 'No alerts in the last hour.',
      ...LIVE_CAMERA_TEXTS,
    },
  });
};

beforeAll(installDomShims);

beforeEach(() => {
  events = [];
  vi.stubGlobal('fetch', vi.fn(serve));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('live wall block', () => {
  it('should show one tile per camera, named with a link to the camera and its area', async () => {
    const rows = [{ ...camera(1, 'Entrance'), buro_rel_0: { name: 'Main Entrance' } }, camera(2, 'Lobby')];
    await render({ rows, total: 3 });

    const wall = await screen.findByTestId('live-wall');
    const tiles = within(wall).getAllByTestId('wall-tile');
    expect(tiles).toHaveLength(2);
    const links = tiles.map((tile) => within(tile).getByRole('link'));
    expect(links.map((link) => link.textContent)).toEqual(['Entrance', 'Lobby']);
    expect(links[0]?.getAttribute('href')).toBe(`/devices/${rows[0]?.id}`);
    expect(within(tiles[0] as HTMLElement).getByText('Main Entrance')).toBeDefined();
    expect(within(tiles[1] as HTMLElement).getByText('No area set')).toBeDefined();
    expect(within(wall).getByText(/Showing the first 2 of 3 cameras\./)).toBeDefined();
  });

  it('should list the last hour’s alerts and ring the tile of the camera that just saw a critical one', async () => {
    const rows = [camera(1, 'Entrance'), camera(2, 'Lobby')];
    events = [
      event('1', 'blacklist_match', 'critical', rows[1]!.id, 5),
      event('2', 'loitering', 'low', rows[0]!.id, 20),
      event('3', 'restricted_area_entry', 'high', rows[0]!.id, 600),
    ];
    await render({ rows, total: 2 });

    const feed = await screen.findByTestId('wall-alerts');
    await waitFor(() => expect(within(feed).getAllByTestId('wall-alert')).toHaveLength(3));
    const tiles = screen.getAllByTestId('wall-tile');
    // Only the fresh critical alert lights a tile: the low one does not, the high one is ten minutes old.
    expect(tiles.map((tile) => tile.getAttribute('data-alert'))).toEqual([null, 'true']);
  });

  it('should leave the alert feed out when the place asks for none', async () => {
    await render({ rows: [camera(1, 'Entrance')], total: 1 }, { alerts: false });
    await screen.findByTestId('wall-tile');
    expect(screen.queryByTestId('wall-alerts')).toBeNull();
  });

  it('should receive every tile’s detections over one connection', async () => {
    sockets.opened = 0;
    sockets.joins = [];
    const rows = [camera(1, 'Entrance'), camera(2, 'Lobby'), camera(3, 'Warehouse')];
    await render({ rows, total: 3 });
    await waitFor(() => expect(sockets.joins).toHaveLength(3));
    expect(sockets.opened).toBe(1);
    expect(sockets.joins).toEqual(rows.map((row) => row.id));
  });

  it('should say so when no camera runs recognition', async () => {
    await render({ rows: [], total: 0 });
    expect(await screen.findByText('No camera runs recognition here.')).toBeDefined();
  });

  it('should read the cameras running recognition again while the wall is open', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await render({ rows: [camera(1, 'Entrance')], total: 1 });
    const wall = await screen.findByTestId('live-wall');
    expect(within(wall).getAllByTestId('wall-tile')).toHaveLength(1);
    expect(JSON.stringify(deviceReads()[0]?.variables)).toContain('"recognition_enabled":{"_eq":true}');

    // Recognition switched on for a second camera elsewhere: it joins the wall on the next read.
    served = { rows: [camera(1, 'Entrance'), camera(2, 'Lobby')], total: 2 };
    await act(() => vi.advanceTimersByTimeAsync(LIVE_WALL_REFRESH_MS + 1000));
    await waitFor(() => expect(within(screen.getByTestId('live-wall')).getAllByTestId('wall-tile')).toHaveLength(2));
  });
});
