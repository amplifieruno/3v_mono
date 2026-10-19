/** A camera the recognition manager runs a session for. */
export type RecognitionDevice = {
  id: string;
  organizationId: string;
  /** stream-server stream id: last path segment of `devices.stream_url` (rtsp://mediamtx:8554/<id>). */
  streamId: string;
  /** devices.recognition_fps (1..5): snapshots per second. */
  fps: number;
};

export type DetectionBox = { x: number; y: number; width: number; height: number };

/**
 * Socket.io `detection` event, emitted to room `device:<deviceId>` once the detection row is committed.
 * `identityId`/`identityCode` are null for a face that was neither matched nor good enough to create an identity.
 */
export type DetectionMessage = {
  detectionId: string;
  deviceId: string;
  identityId: string | null;
  identityCode: string | null;
  profileId: string | null;
  profileName: string | null;
  isNewIdentity: boolean;
  confidence: number;
  bbox: DetectionBox;
  frameWidth: number;
  frameHeight: number;
  detectedAt: string;
};

export type FrameResult = { faces: number; detections: DetectionMessage[] };

/** Live counters of one device's session (recognition_status). */
export type SessionStats = {
  running: boolean;
  fps: number;
  framesProcessed: number;
  framesDropped: number;
  facesDetected: number;
  detections: number;
  lastFrameAt: string | null;
  lastError: string | null;
};
