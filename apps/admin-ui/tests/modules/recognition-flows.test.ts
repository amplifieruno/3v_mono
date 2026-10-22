import { answer, runFlow } from '@burojs/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import { DEVICE_RESOURCE } from '../../src/data/resource-names';
import { HASURA_OPERATIONS } from '../../src/modules';
import { RECOGNITION_EFFECTS } from '../../src/modules/devices/recognition';

/**
 * Start / Stop recognition without the UI (Review Focus 5): neither is offered on a terminal or
 * a sensor, a camera is offered the one matching its `recognition_enabled`, an inactive camera
 * or one without a stream is refused before anything is sent, and the action gets the device id.
 */

const ADMIN = { id: 'u1', roles: ['org_admin'] };
const CAMERA_ID = 'cccccccc-cccc-4ccc-8ccc-000000000001';
const camera = {
  id: CAMERA_ID,
  name: 'Entrance camera',
  device_type: 'static_video_camera',
  status: 'active',
  stream_url: 'rtsp://stream-server:8554/entrance',
  recognition_enabled: false,
};
const STATUS = {
  device_id: CAMERA_ID,
  enabled: true,
  running: true,
  fps: 1,
  frames_processed: 0,
  frames_dropped: 0,
  faces_detected: 0,
  faces_suppressed: 0,
  detections: 0,
  last_frame_at: null,
  last_error: null,
};

const start = { resource: DEVICE_RESOURCE, action: 'start_recognition' } as const;
const stop = { resource: DEVICE_RESOURCE, action: 'stop_recognition' } as const;

const run = (target: typeof start | typeof stop, record: Record<string, unknown>) =>
  runFlow(app, target, {
    user: ADMIN,
    record,
    rows: { [DEVICE_RESOURCE]: [record] },
    mutations: {
      'itap:recognition-start': [answer(STATUS)],
      'itap:recognition-stop': [answer({ ...STATUS, enabled: false, running: false })],
    },
  });

beforeAll(async () => {
  await app.ready;
});

describe('recognition flows', () => {
  it('should start recognition on a camera that is off, with the device id', async () => {
    const flow = run(start, camera);
    await flow.submit();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({ input: { deviceId: CAMERA_ID } });
    expect(flow.state.effects?.notify).toBe('Recognition started.');
  });

  it('should stop recognition on a camera that is on', async () => {
    const flow = run(stop, { ...camera, recognition_enabled: true });
    await flow.submit();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({ input: { deviceId: CAMERA_ID } });
  });

  it('should offer only the flow matching the camera’s state', async () => {
    const offered = await run(start, camera).open();
    expect(() => offered.assertUnavailable()).toThrow();
    (await run(stop, camera).open()).assertUnavailable();
    (await run(start, { ...camera, recognition_enabled: true }).open()).assertUnavailable();
  });

  it('should offer neither flow on a terminal or a sensor', async () => {
    for (const device_type of ['access_terminal', 'sensor']) {
      const device = { ...camera, device_type, stream_url: null };
      (await run(start, device).open()).assertUnavailable();
      (await run(stop, { ...device, recognition_enabled: true }).open()).assertUnavailable();
    }
  });

  it('should refuse an inactive camera or one without a stream before sending', async () => {
    for (const record of [{ ...camera, status: 'maintenance' }, { ...camera, stream_url: null }]) {
      const flow = run(start, record);
      await flow.submit();
      flow.assertNotSubmitted();
    }
  });

  it('should refresh the device after either action and map the action answer', () => {
    expect(RECOGNITION_EFFECTS).toEqual([{ resource: DEVICE_RESOURCE }]);
    const entry = HASURA_OPERATIONS.devices?.recognitionStart;
    expect(entry?.kind).toBe('mutation');
    expect(entry?.variables?.({ deviceId: CAMERA_ID })).toEqual({ device: CAMERA_ID });
    expect(entry?.mapResult?.({ recognition_start: STATUS })).toEqual(STATUS);
    expect(entry?.mapResult?.({ recognition_start: null })).toBeNull();
    expect(HASURA_OPERATIONS.devices?.recognitionStatus?.kind).toBe('query');
  });
});
