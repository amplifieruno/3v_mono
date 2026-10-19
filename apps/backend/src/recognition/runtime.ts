import type { Server } from 'socket.io';
import { verifyOrgToken } from '../auth/hasuraJwt.js';
import type { Env } from '../config/env.js';
import { createCameraIdentity } from '../face/cameraIdentity.js';
import { DEFAULT_MODEL_VERSION } from '../face/enrollmentService.js';
import { createInsightFaceClient } from '../face/insightFaceClient.js';
import { streamIdOf } from '../events/deviceHealthCheck.js';
import { createHasuraClient, type HasuraClient } from '../hasura/client.js';
import { createStorageClient } from '../storage/storageClient.js';
import { processFrame } from './frame.js';
import { createRecognitionManager, type RecognitionManager } from './manager.js';
import { setRecognitionManager } from './registry.js';
import { createRecognitionSession } from './session.js';
import { attachRecognitionSocket, publishDetection } from './socket.js';
import type { RecognitionDevice } from './types.js';

const SNAPSHOT_TIMEOUT_MS = 5000;

const LIST_DEVICES = `
  query RecognitionDevices {
    devices(
      where: {
        recognition_enabled: { _eq: true }
        status: { _eq: active }
        stream_url: { _is_null: false }
        device_type: { _in: [static_video_camera, ptz_camera, thermal_camera] }
      }
      order_by: { id: asc }
    ) { id organization_id stream_url recognition_fps }
  }
`;
const DEVICE_IN_ORG = `
  query RecognitionSocketDevice($id: uuid!, $org: uuid!) {
    devices(where: { id: { _eq: $id }, organization_id: { _eq: $org } }) { id }
  }
`;

type DeviceRow = { id: string; organization_id: string; stream_url: string; recognition_fps: number };

const log = (message: string): void => {
  console.warn(message);
};

/** Cameras with recognition enabled, across all organizations (admin secret). */
export async function listRecognitionDevices(admin: HasuraClient): Promise<RecognitionDevice[]> {
  const { devices } = await admin.request<{ devices: DeviceRow[] }>(LIST_DEVICES);
  return devices.flatMap((d) => {
    const streamId = streamIdOf(d.stream_url);
    return streamId ? [{ id: d.id, organizationId: d.organization_id, streamId, fps: d.recognition_fps }] : [];
  });
}

async function fetchSnapshot(env: Env, streamId: string): Promise<Buffer> {
  const base = env.STREAM_SERVER_URL.replace(/\/+$/, '');
  const res = await fetch(`${base}/streams/${encodeURIComponent(streamId)}/snapshot.jpg`, {
    signal: AbortSignal.timeout(SNAPSHOT_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Snapshot of stream ${streamId} failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/** Wires the manager to Hasura, storage, InsightFace, the stream-server and Socket.io, and starts it. */
export function startRecognition(env: Env, io: Server): RecognitionManager {
  const admin = createHasuraClient(env);
  const storage = createStorageClient(env);
  const insightFace = createInsightFaceClient(env.INSIGHTFACE_API_URL);

  attachRecognitionSocket(io, {
    verifyToken: (token) => verifyOrgToken(token, env.HASURA_JWT_SECRET),
    deviceInOrganization: async (id, org) =>
      (await admin.request<{ devices: { id: string }[] }>(DEVICE_IN_ORG, { id, org })).devices.length > 0,
  });

  const manager = createRecognitionManager({
    listDevices: () => listRecognitionDevices(admin),
    log,
    createSession: (device) => {
      // Admin rights with the device organization's session: match_face scope, audited writes without a user.
      const org = createHasuraClient(env, { role: 'admin', organizationId: device.organizationId });
      const enrollment = { clients: { admin: org, actor: org }, storage, insightFace, organizationId: device.organizationId };
      return createRecognitionSession(device, {
        fetchSnapshot: (streamId) => fetchSnapshot(env, streamId),
        processFrame: (frame, capturedAt, signal) =>
          processFrame(
            {
              org,
              storage,
              insightFace,
              modelVersion: DEFAULT_MODEL_VERSION,
              log,
              createIdentity: async (capture, options) => {
                const created = await createCameraIdentity(enrollment, [capture], options);
                return { id: created.id, code: created.code, cropFileId: created.cropFileIds[0] ?? null };
              },
            },
            device,
            frame,
            capturedAt,
            signal,
          ),
        onDetection: (message) => publishDetection(io, message),
        log,
      });
    },
  });
  setRecognitionManager(manager);
  manager.start();
  return manager;
}
