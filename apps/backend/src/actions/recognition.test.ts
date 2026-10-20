import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import type { HasuraClient } from '../hasura/client.js';
import type { RecognitionManager } from '../recognition/manager.js';
import { setRecognitionManager } from '../recognition/registry.js';
import { recognitionStart, recognitionStatus, recognitionStop } from './recognition.js';
import { ActionError, type ActionHandler } from './types.js';

const ORG = '22222222-2222-4222-8222-222222222222';
const DEVICE = '11111111-1111-4111-8111-111111111111';

type DeviceRow = {
  id: string;
  device_type: string;
  status: string;
  stream_url: string | null;
  recognition_enabled: boolean;
  recognition_fps: number;
};
const camera: DeviceRow = {
  id: DEVICE,
  device_type: 'static_video_camera',
  status: 'active',
  stream_url: 'rtsp://mediamtx:8554/warehouse',
  recognition_enabled: false,
  recognition_fps: 2,
};

function run(handler: ActionHandler<unknown, unknown>, input: unknown, { device = camera as DeviceRow | null, org = ORG as string | null } = {}) {
  const admin = { request: vi.fn(async () => ({ devices: device ? [device] : [] })) };
  const actor = { request: vi.fn(async () => ({ update_devices_by_pk: { id: DEVICE } })) };
  const promise = handler({
    env: {} as Env,
    input,
    session: { role: 'org_admin', userId: 'u', ...(org ? { organizationId: org } : {}) },
    admin: admin as unknown as HasuraClient,
    asCaller: admin as unknown as HasuraClient,
    actor: actor as unknown as HasuraClient,
  });
  return { promise, admin, actor };
}

async function errorCode(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(() => undefined, (e: unknown) => e);
  expect(error).toBeInstanceOf(ActionError);
  return (error as ActionError).code;
}

function fakeManager(running: boolean): RecognitionManager {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    refresh: vi.fn(async () => undefined),
    status: vi.fn(() =>
      running
        ? {
            running: true,
            fps: 2,
            framesProcessed: 7,
            framesDropped: 1,
            facesDetected: 3,
            facesSuppressed: 1,
            detections: 3,
            lastFrameAt: '2026-10-19T10:00:00.000Z',
            lastError: null,
          }
        : undefined,
    ),
  };
}

afterEach(() => setRecognitionManager(undefined));

describe('recognition actions', () => {
  it('should enable recognition through the actor, notify the manager and return live status', async () => {
    const manager = fakeManager(true);
    setRecognitionManager(manager);
    const { promise, actor, admin } = run(recognitionStart, { device_id: DEVICE });
    expect(await promise).toEqual({
      device_id: DEVICE,
      enabled: true,
      running: true,
      fps: 2,
      frames_processed: 7,
      frames_dropped: 1,
      faces_detected: 3,
      faces_suppressed: 1,
      detections: 3,
      last_frame_at: '2026-10-19T10:00:00.000Z',
      last_error: null,
    });
    expect(admin.request).toHaveBeenCalledWith(expect.any(String), { id: DEVICE, org: ORG });
    expect(actor.request).toHaveBeenCalledWith(expect.stringContaining('update_devices_by_pk'), { id: DEVICE, enabled: true });
    expect(manager.refresh).toHaveBeenCalled();
  });

  it('should disable recognition and report a stopped session', async () => {
    const manager = fakeManager(false);
    setRecognitionManager(manager);
    const { promise, actor } = run(recognitionStop, { device_id: DEVICE }, { device: { ...camera, recognition_enabled: true } });
    expect(await promise).toMatchObject({ enabled: false, running: false, fps: 2, frames_processed: 0, last_error: null });
    expect(actor.request).toHaveBeenCalledWith(expect.any(String), { id: DEVICE, enabled: false });
  });

  it('should report status without writing anything', async () => {
    setRecognitionManager(fakeManager(true));
    const { promise, actor } = run(recognitionStatus, { device_id: DEVICE }, { device: { ...camera, recognition_enabled: true } });
    expect(await promise).toMatchObject({ enabled: true, running: true, frames_processed: 7 });
    expect(actor.request).not.toHaveBeenCalled();
  });

  it('should still toggle when recognition is off in this process', async () => {
    const { promise } = run(recognitionStart, { device_id: DEVICE });
    expect(await promise).toMatchObject({ enabled: true, running: false });
  });

  it('should reject devices outside the session organization, non-cameras and cameras without a stream', async () => {
    expect(await errorCode(run(recognitionStart, { device_id: DEVICE }, { device: null }).promise)).toBe('device_not_found');
    expect(
      await errorCode(run(recognitionStart, { device_id: DEVICE }, { device: { ...camera, device_type: 'access_terminal' } }).promise),
    ).toBe('device_not_camera');
    expect(await errorCode(run(recognitionStart, { device_id: DEVICE }, { device: { ...camera, stream_url: null } }).promise)).toBe(
      'device_no_stream',
    );
  });

  it('should refuse to start recognition on a camera that is not active, but allow stop and status', async () => {
    const inactive = { ...camera, status: 'maintenance' };
    expect(await errorCode(run(recognitionStart, { device_id: DEVICE }, { device: inactive }).promise)).toBe('device_inactive');
    const stopped = run(recognitionStop, { device_id: DEVICE }, { device: inactive });
    expect(await stopped.promise).toMatchObject({ enabled: false });
    expect(await run(recognitionStatus, { device_id: DEVICE }, { device: inactive }).promise).toMatchObject({ running: false });
  });

  it('should require an organization session and a valid device id', async () => {
    expect(await errorCode(run(recognitionStatus, { device_id: DEVICE }, { org: null }).promise)).toBe('no_organization');
    expect(await errorCode(run(recognitionStatus, { device_id: 'nope' }).promise)).toBe('invalid_input');
  });
});
