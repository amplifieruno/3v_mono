import { z } from 'zod';
import { getRecognitionManager } from '../recognition/registry.js';
import { ActionError, defineAction, type ActionContext } from './types.js';

export type RecognitionStatus = {
  device_id: string;
  /** devices.recognition_enabled */
  enabled: boolean;
  /** A session of this process is running for the device. */
  running: boolean;
  fps: number;
  frames_processed: number;
  frames_dropped: number;
  faces_detected: number;
  detections: number;
  last_frame_at: string | null;
  last_error: string | null;
};

const CAMERA_TYPES = new Set(['static_video_camera', 'ptz_camera', 'thermal_camera']);

const DEVICE = `
  query RecognitionDevice($id: uuid!, $org: uuid!) {
    devices(where: { id: { _eq: $id }, organization_id: { _eq: $org } }) {
      id device_type stream_url recognition_enabled recognition_fps
    }
  }
`;
const TOGGLE = `
  mutation RecognitionToggle($id: uuid!, $enabled: Boolean!) {
    update_devices_by_pk(pk_columns: { id: $id }, _set: { recognition_enabled: $enabled }) { id }
  }
`;

type DeviceRow = {
  id: string;
  device_type: string;
  stream_url: string | null;
  recognition_enabled: boolean;
  recognition_fps: number;
};

const schema = z.object({ device_id: z.string().uuid().transform((id) => id.toLowerCase()) });
type Input = z.output<typeof schema>;

/** The device of the session organization; it must be a camera with a stream. */
async function cameraOf(ctx: ActionContext<Input>): Promise<DeviceRow> {
  const organizationId = ctx.session.organizationId?.toLowerCase();
  if (!organizationId) throw new ActionError('no_organization', 'An organization session is required');
  const { devices } = await ctx.admin.request<{ devices: DeviceRow[] }>(DEVICE, { id: ctx.input.device_id, org: organizationId });
  const device = devices[0];
  if (!device) throw new ActionError('device_not_found', 'Device not found');
  if (!CAMERA_TYPES.has(device.device_type)) throw new ActionError('device_not_camera', 'Recognition runs on cameras only');
  if (!device.stream_url) throw new ActionError('device_no_stream', 'The camera has no stream URL');
  return device;
}

function statusOf(device: DeviceRow, enabled: boolean): RecognitionStatus {
  const stats = getRecognitionManager()?.status(device.id);
  return {
    device_id: device.id,
    enabled,
    running: stats?.running ?? false,
    fps: stats?.fps ?? device.recognition_fps,
    frames_processed: stats?.framesProcessed ?? 0,
    frames_dropped: stats?.framesDropped ?? 0,
    faces_detected: stats?.facesDetected ?? 0,
    detections: stats?.detections ?? 0,
    last_frame_at: stats?.lastFrameAt ?? null,
    last_error: stats?.lastError ?? null,
  };
}

/**
 * Sets recognition_enabled through the actor (audited as the caller), then lets this process's manager pick it up
 * at once (it would within its 10 s poll anyway).
 */
async function toggle(ctx: ActionContext<Input>, enabled: boolean): Promise<RecognitionStatus> {
  const device = await cameraOf(ctx);
  await ctx.actor.request(TOGGLE, { id: device.id, enabled });
  await getRecognitionManager()?.refresh();
  return statusOf(device, enabled);
}

/** recognition_start(device_id) */
export const recognitionStart = defineAction(schema, (ctx) => toggle(ctx, true));

/** recognition_stop(device_id) */
export const recognitionStop = defineAction(schema, (ctx) => toggle(ctx, false));

/** recognition_status(device_id): live counters of the device's session. */
export const recognitionStatus = defineAction(schema, async (ctx) => {
  const device = await cameraOf(ctx);
  return statusOf(device, device.recognition_enabled);
});
