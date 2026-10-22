// @vitest-environment jsdom
import { renderBlock } from '@burojs/testing/react';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import type * as React from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppRuntime } from '../../src/app/runtime';
import { LIVE_CAMERA_TEXTS } from '../../src/blocks/live-camera/live-camera-texts';
import { liveWallView } from '../../src/blocks/live-camera/views';
import { fakeAdminAuth, installDomShims } from '../support/console-dom';

/**
 * The `itap:live-wall` block with fake rows: one live view per camera running recognition, each
 * headed by the camera's name linking to its page; a note when there is none. The player and the
 * socket client are stubbed (no network in the unit tests).
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

const render = (cameras: unknown) =>
  renderBlock(liveWallView, {
    data: { cameras },
    wrapper: Wrapper,
    messages: {
      none: 'No camera runs recognition here.',
      truncated: 'Showing the first {{shown}} of {{total}} cameras.',
      ...LIVE_CAMERA_TEXTS,
    },
  });

beforeAll(installDomShims);

afterEach(() => {
  cleanup();
});

describe('live wall block', () => {
  it('should show one live view per camera, headed by a link to the camera', async () => {
    const rows = [camera(1, 'Entrance'), camera(2, 'Lobby')];
    await render({ rows, total: 3 });

    const wall = await screen.findByTestId('live-wall');
    const views = within(wall).getAllByTestId('live-camera');
    expect(views).toHaveLength(2);
    const links = within(wall).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Entrance', 'Lobby']);
    expect(links[0]?.getAttribute('href')).toBe(`/devices/${rows[0]?.id}`);
    expect(within(wall).getByText('Showing the first 2 of 3 cameras.')).toBeDefined();
  });

  it('should receive every tile’s detections over one connection', async () => {
    sockets.opened = 0;
    sockets.joins = [];
    const rows = [camera(1, 'Entrance'), camera(2, 'Lobby'), camera(3, 'Warehouse')];
    await render({ rows, total: 3 });
    await waitFor(() => expect(screen.getAllByText('Detections live')).toHaveLength(3));
    expect(sockets.opened).toBe(1);
    expect(sockets.joins).toEqual(rows.map((row) => row.id));
  });

  it('should say so when no camera runs recognition', async () => {
    await render({ rows: [], total: 0 });
    expect(await screen.findByText('No camera runs recognition here.')).toBeDefined();
  });
});
