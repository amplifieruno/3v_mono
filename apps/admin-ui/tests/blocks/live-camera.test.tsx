// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamAttacher, StreamEvents } from '../../src/blocks/live-camera/hls-player';
import {
  type LiveCameraDeps,
  type LiveCameraDevice,
  LiveCameraPanel,
} from '../../src/blocks/live-camera/live-camera-panel';
import { LIVE_CAMERA_TEXTS } from '../../src/blocks/live-camera/live-camera-texts';
import { livePlaylistUrl, streamIdOf } from '../../src/blocks/live-camera/stream-url';
import { BOX_FADE } from '../../src/blocks/live-camera/detection-overlay';
import {
  STREAM_RETRY_MS,
  STREAM_STALL_MS,
  STREAM_START_TIMEOUT_MS,
} from '../../src/blocks/live-camera/use-stream-playback';
import type { DetectionMessage, DetectionSocket } from '../../src/realtime/detections';
import { installDomShims } from '../support/console-dom';

/**
 * The live camera view with a fake player and a fake socket: a camera whose stream is down shows
 * "Stream unavailable" over the picture area, never a black box (Review Focus 4); a playing
 * stream draws labelled boxes scaled from the frame size that go after two seconds, and counts
 * what arrived.
 */

const DEVICE: LiveCameraDevice = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Entrance camera',
  stream_url: 'rtsp://mediamtx:8554/entrance',
  recognition_enabled: true,
};

const t = (key: string, options?: { readonly params?: Record<string, unknown> }): string => {
  const text = (LIVE_CAMERA_TEXTS as Record<string, string>)[key] ?? key;
  return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options?.params?.[name] ?? ''));
};

const message = (more: Partial<DetectionMessage>): DetectionMessage => ({
  detectionId: 'd-1',
  deviceId: DEVICE.id,
  identityId: 'i-1',
  identityCode: 'ID-0001',
  profileId: null,
  profileName: null,
  isNewIdentity: false,
  confidence: 0.87,
  bbox: { x: 100, y: 200, width: 80, height: 100 },
  frameWidth: 1280,
  frameHeight: 720,
  detectedAt: '2026-10-22T10:00:00.000Z',
  ...more,
});

interface Harness {
  readonly deps: LiveCameraDeps;
  readonly attached: { url: string; events: StreamEvents; destroyed: boolean }[];
  /** The server side of the latest socket: accept the join, push detections. */
  readonly server: {
    accept(ack?: unknown): void;
    push(payload: unknown): void;
    drop(reason: string): void;
    refuse(message: string): void;
  };
  /** Connections opened, and the rooms joined on the latest one. */
  readonly opened: { count: number; joins: string[] };
}

function harness(): Harness {
  const attached: Harness['attached'] = [];
  let handlers: {
    connect?: () => void;
    detection?: (payload: unknown) => void;
    acks: ((r: unknown) => void)[];
    disconnect?: (reason: string) => void;
    error?: (message: string) => void;
  } = { acks: [] };
  const opened = { count: 0, joins: [] as string[] };
  const attach: StreamAttacher = async (_video, url, events) => {
    const entry = { url, events, destroyed: false };
    attached.push(entry);
    return { destroy: () => void (entry.destroyed = true) };
  };
  const socket = (): DetectionSocket => {
    handlers = { acks: [] };
    opened.count += 1;
    opened.joins = [];
    return {
      onConnect: (handler) => void (handlers.connect = handler),
      onConnectError: (handler) => void (handlers.error = handler),
      onDisconnect: (handler) => void (handlers.disconnect = handler),
      onDetection: (handler) => void (handlers.detection = handler),
      join: (deviceId, ack) => {
        opened.joins.push(deviceId);
        handlers.acks.push(ack);
      },
      leave: () => undefined,
      close: () => undefined,
    };
  };
  return {
    attached,
    opened,
    deps: { attach, loadSocket: async () => socket, getToken: async () => 'org-token' },
    server: {
      accept(ack = { ok: true }) {
        handlers.connect?.();
        for (const answer of handlers.acks) answer(ack);
      },
      refuse(message) {
        handlers.error?.(message);
      },
      drop(reason) {
        handlers.disconnect?.(reason);
      },
      push(payload) {
        handlers.detection?.(payload);
      },
    },
  };
}

const flush = () => act(() => vi.advanceTimersByTimeAsync(0));

beforeAll(installDomShims);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('stream url', () => {
  it('should read the stream id as the last path segment of the stream address', () => {
    expect(streamIdOf('rtsp://mediamtx:8554/entrance')).toBe('entrance');
    expect(streamIdOf('rtsp://10.0.0.20/cams/lobby/')).toBe('lobby');
    expect(streamIdOf('rtsp://10.0.0.20')).toBeNull();
    expect(streamIdOf('not a url')).toBeNull();
    expect(streamIdOf(null)).toBeNull();
    expect(livePlaylistUrl('rtsp://mediamtx:8554/server%20room')).toBe('/streams/server%20room/live.m3u8');
  });
});

describe('live camera view', () => {
  it('should show "Stream unavailable" when the stream is down, and retry it (Review Focus 4)', async () => {
    const h = harness();
    render(<LiveCameraPanel device={DEVICE} deps={h.deps} t={t} />);
    await flush();

    expect(h.attached.map((a) => a.url)).toEqual(['/streams/entrance/live.m3u8']);
    expect(screen.getByRole('status').textContent).toContain('Connecting to the stream…');

    act(() => h.attached[0]?.events.onUnavailable());
    const note = screen.getByRole('status');
    expect(within(note).getByText('Stream unavailable')).toBeDefined();
    expect(screen.getByText('Stream down')).toBeDefined();
    // The video element is kept but hidden: no black box.
    expect(screen.getByLabelText('Live video of Entrance camera', { selector: 'video' }).className).toContain(
      'invisible',
    );

    fireEvent.click(within(note).getByRole('button', { name: 'Try again' }));
    await flush();
    expect(h.attached).toHaveLength(2);
    expect(h.attached[0]?.destroyed).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('Connecting to the stream…');
  });

  it('should count a stream that shows no frame in time as unavailable and try it again later', async () => {
    const h = harness();
    render(<LiveCameraPanel device={DEVICE} deps={h.deps} t={t} />);
    await flush();
    await act(() => vi.advanceTimersByTimeAsync(STREAM_START_TIMEOUT_MS));
    expect(screen.getByText('Stream unavailable')).toBeDefined();
    await act(() => vi.advanceTimersByTimeAsync(STREAM_RETRY_MS));
    expect(h.attached).toHaveLength(2);
  });

  it('should say so for a camera without a stream address', async () => {
    const h = harness();
    render(<LiveCameraPanel device={{ ...DEVICE, stream_url: null }} deps={h.deps} t={t} />);
    await flush();
    expect(h.attached).toHaveLength(0);
    expect(screen.getByRole('status').textContent).toContain('No stream address is set for this camera.');
    expect(screen.queryByText('Stream down')).toBeNull();
  });

  it('should draw labelled boxes of the latest frame scaled from its size and drop them after two seconds', async () => {
    const h = harness();
    render(<LiveCameraPanel device={DEVICE} deps={h.deps} t={t} />);
    await flush();
    const video = screen.getByLabelText('Live video of Entrance camera', { selector: 'video' });
    act(() => void video.dispatchEvent(new Event('playing')));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('Stream live')).toBeDefined();

    act(() => h.server.accept());
    expect(screen.getByText('Detections live')).toBeDefined();
    act(() => {
      h.server.push(message({ detectionId: 'd-1', identityId: 'i-1', profileId: 'p-1', profileName: 'Anna Lee' }));
      h.server.push(message({ detectionId: 'd-2', identityId: 'i-2', isNewIdentity: true, identityCode: 'ID-0002' }));
      h.server.push(message({ detectionId: 'd-3', identityId: 'i-3', identityCode: 'ID-0003' }));
      h.server.push(message({ detectionId: 'd-4', identityId: null, identityCode: null }));
    });

    const overlay = screen.getByRole('img', { name: 'Faces recognised on Entrance camera' });
    expect(overlay.getAttribute('viewBox')).toBe('0 0 1280 720');
    const boxes = within(overlay).getAllByTestId('live-box');
    expect(boxes.map((box) => box.querySelector('text')?.textContent)).toEqual([
      'Anna Lee',
      'New',
      'ID-0003',
      'Unidentified face',
    ]);
    expect(boxes[0]?.querySelector('rect')?.getAttribute('x')).toBe('100');
    expect(boxes[0]?.querySelector('title')?.textContent).toBe('Anna Lee · 87 %');
    expect(screen.getByTestId('live-count:detections').textContent).toBe('4');
    expect(screen.getByTestId('live-count:known').textContent).toBe('1');
    expect(screen.getByTestId('live-count:newIdentities').textContent).toBe('1');
    expect(screen.getByTestId('live-count:unidentified').textContent).toBe('1');

    // A late detection of an older frame is not drawn; a newer frame replaces the boxes.
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    act(() => h.server.push(message({ detectionId: 'd-old', detectedAt: '2026-10-22T09:59:59.000Z' })));
    expect(within(overlay).getAllByTestId('live-box')).toHaveLength(4);
    act(() =>
      h.server.push(
        message({
          detectionId: 'd-5',
          identityId: 'i-1',
          profileName: 'Anna Lee',
          profileId: 'p-1',
          frameWidth: 640,
          frameHeight: 360,
          bbox: { x: 50, y: 100, width: 40, height: 50 },
          detectedAt: '2026-10-22T10:00:01.000Z',
        }),
      ),
    );
    expect(within(overlay).getAllByTestId('live-box').map((box) => box.querySelector('text')?.textContent)).toEqual([
      'Anna Lee',
    ]);
    expect(overlay.getAttribute('viewBox')).toBe('0 0 640 360');
    // Each box goes two seconds after it arrived.
    await act(() => vi.advanceTimersByTimeAsync(1_999));
    expect(within(overlay).getAllByTestId('live-box')).toHaveLength(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(screen.queryByRole('img', { name: 'Faces recognised on Entrance camera' })).toBeNull();
  });

  it('should note that recognition is off and when the camera is not in the organization', async () => {
    const h = harness();
    render(<LiveCameraPanel device={{ ...DEVICE, recognition_enabled: false }} deps={h.deps} t={t} />);
    await flush();
    expect(screen.getByText(LIVE_CAMERA_TEXTS.recognitionOff)).toBeDefined();
    expect(screen.getByText('Detections connecting')).toBeDefined();
    act(() => h.server.accept({ ok: false, error: 'device_not_found' }));
    expect(screen.getByText('Detections stopped')).toBeDefined();
    expect(screen.getByText(LIVE_CAMERA_TEXTS['error_device-not-found'])).toBeDefined();
  });

  it('should offer Reconnect after repeated refusals, and connect again on it', async () => {
    const h = harness();
    render(<LiveCameraPanel device={DEVICE} deps={h.deps} t={t} />);
    await flush();
    expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull();
    act(() => h.server.refuse('unauthorized'));
    await act(() => vi.advanceTimersByTimeAsync(500));
    act(() => h.server.refuse('unauthorized'));
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    act(() => h.server.refuse('unauthorized'));
    expect(h.opened.count).toBe(3);
    expect(screen.getByText(LIVE_CAMERA_TEXTS.error_unauthorized)).toBeDefined();
    expect(screen.getByText('Detections stopped')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    await flush();
    expect(h.opened.count).toBe(4);
    expect(screen.getByText('Detections connecting')).toBeDefined();
    act(() => h.server.accept());
    expect(screen.getByText('Detections live')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull();
    expect(screen.queryByText(LIVE_CAMERA_TEXTS.error_unauthorized)).toBeNull();
  });

  it('should share one connection between the views of one session', async () => {
    const h = harness();
    const other = { ...DEVICE, id: '33333333-3333-4333-8333-333333333333', name: 'Lobby camera' };
    render(
      <>
        <LiveCameraPanel device={DEVICE} deps={h.deps} t={t} />
        <LiveCameraPanel device={other} deps={h.deps} t={t} />
      </>,
    );
    await flush();
    act(() => h.server.accept());
    expect(h.opened.count).toBe(1);
    expect(h.opened.joins).toEqual([DEVICE.id, other.id]);
    expect(screen.getAllByText('Detections live')).toHaveLength(2);
  });

  it('should say that detections are unavailable when the socket client cannot be loaded', async () => {
    const h = harness();
    const deps = { ...h.deps, loadSocket: () => Promise.reject(new Error('chunk failed')) };
    render(<LiveCameraPanel device={DEVICE} deps={deps} t={t} />);
    await flush();
    expect(screen.getByText(LIVE_CAMERA_TEXTS.error_unavailable)).toBeDefined();
    expect(screen.getByText('Detections unavailable')).toBeDefined();
  });
  /** Mounts a playing view with a live detection stream. */
  async function playing(h: Harness): Promise<HTMLVideoElement> {
    render(<LiveCameraPanel device={DEVICE} deps={h.deps} t={t} />);
    await flush();
    const video = screen.getByLabelText('Live video of Entrance camera', { selector: 'video' }) as HTMLVideoElement;
    act(() => void video.dispatchEvent(new Event('playing')));
    act(() => h.server.accept());
    return video;
  }

  it('should fade each box from its own insertion, also boxes arriving long after the view opened', async () => {
    const h = harness();
    await playing(h);
    act(() => h.server.push(message({ detectionId: 'd-1' })));
    const first = screen.getByTestId('live-box');
    expect(first.getAttribute('class')).toBe(BOX_FADE);
    // The fade is dropped for viewers who ask for reduced motion (the box is still removed after 2 s).
    expect(BOX_FADE).toContain('motion-reduce:animate-none');
    // No SVG <animate>: its clock is the drawing's, so a box added after 2 s would start faded.
    expect(first.querySelector('animate')).toBeNull();

    // Recognition keeps running: frames 10 s later still get a fresh, fully visible box.
    for (let second = 1; second <= 10; second += 1) {
      await act(() => vi.advanceTimersByTimeAsync(1_000));
      act(() =>
        h.server.push(
          message({ detectionId: `d-${second + 1}`, detectedAt: `2026-10-22T10:00:${String(second).padStart(2, '0')}.000Z` }),
        ),
      );
    }
    const late = screen.getByTestId('live-box');
    expect(late.getAttribute('class')).toBe(BOX_FADE);
    expect(late.querySelector('text')?.textContent).toBe('ID-0001');
    expect(screen.getAllByTestId('live-box')).toHaveLength(1);
  });

  it('should clear the drawn boxes when the detection stream stops being live', async () => {
    const h = harness();
    await playing(h);
    act(() => h.server.push(message({ detectionId: 'd-1' })));
    expect(screen.getAllByTestId('live-box')).toHaveLength(1);
    act(() => h.server.drop('io server disconnect'));
    expect(screen.getByText('Detections reconnecting')).toBeDefined();
    expect(screen.queryByTestId('live-box')).toBeNull();
  });

  it('should count a stream that stalls too long as unavailable, but not a short stall', async () => {
    const h = harness();
    const video = await playing(h);
    act(() => void video.dispatchEvent(new Event('waiting')));
    await act(() => vi.advanceTimersByTimeAsync(STREAM_STALL_MS - 1_000));
    act(() => void video.dispatchEvent(new Event('playing')));
    await act(() => vi.advanceTimersByTimeAsync(STREAM_STALL_MS));
    expect(screen.getByText('Stream live')).toBeDefined();

    act(() => void video.dispatchEvent(new Event('stalled')));
    await act(() => vi.advanceTimersByTimeAsync(STREAM_STALL_MS));
    expect(screen.getByText('Stream unavailable')).toBeDefined();
    expect(screen.getByText('Stream down')).toBeDefined();
  });

  it('should not flag a stream that reports `stalled` but keeps playing (progress clears the stall)', async () => {
    const h = harness();
    const video = await playing(h);
    // A healthy HLS stream may fire `stalled` while it plays from its buffer: progress follows.
    act(() => void video.dispatchEvent(new Event('stalled')));
    await act(() => vi.advanceTimersByTimeAsync(STREAM_STALL_MS - 1_000));
    act(() => void video.dispatchEvent(new Event('timeupdate')));
    await act(() => vi.advanceTimersByTimeAsync(STREAM_STALL_MS));
    expect(screen.getByText('Stream live')).toBeDefined();

    // A later stall without progress still counts.
    act(() => void video.dispatchEvent(new Event('waiting')));
    await act(() => vi.advanceTimersByTimeAsync(STREAM_STALL_MS));
    expect(screen.getByText('Stream unavailable')).toBeDefined();
  });
});
