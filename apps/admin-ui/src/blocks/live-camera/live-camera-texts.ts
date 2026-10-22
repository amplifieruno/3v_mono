/**
 * The texts of one live camera view, shared by `itap:live-camera` and every tile of
 * `itap:live-wall` (a block's view reads only its own block's texts).
 */
export const LIVE_CAMERA_TEXTS = {
  video: 'Live video of {{name}}',
  overlay: 'Faces recognised on {{name}}',
  loading: 'Connecting to the stream…',
  noStream: 'No stream address is set for this camera.',
  unavailable: 'Stream unavailable',
  unavailableHint: 'The camera’s stream does not answer. It is tried again every 20 seconds.',
  retry: 'Try again',
  stream_loading: 'Stream connecting',
  stream_playing: 'Stream live',
  stream_unavailable: 'Stream down',
  detections_connecting: 'Detections connecting',
  detections_live: 'Detections live',
  detections_reconnecting: 'Detections reconnecting',
  detections_failed: 'Detections stopped',
  detections_unavailable: 'Detections unavailable',
  'error_signed-out': 'Live detections stopped: no organization is selected.',
  error_unauthorized:
    'Live detections stopped: the server refused the session three times in a row. Reconnect, or sign in again if it keeps refusing.',
  reconnect: 'Reconnect',
  'error_device-not-found': 'Live detections stopped: this camera is not in the current organization.',
  'error_invalid-device': 'Live detections stopped: the camera id is not valid.',
  error_unavailable: 'Live detections could not be loaded. Reload the page to try again.',
  recognitionOff: 'Recognition is off for this camera: start it to see faces on the video.',
  known: 'Known person',
  newIdentity: 'New',
  unidentified: 'Unidentified face',
  confidence: '{{label}} · {{confidence}} %',
  counters: 'Since this view opened',
  count_detections: 'Faces',
  count_known: 'Known',
  count_newIdentities: 'New',
  count_unidentified: 'Unidentified',
} as const;

/** A live camera view's `t`, as its block view receives it. */
export type LiveCameraT = (key: string, options?: { readonly params?: Record<string, unknown> }) => string;
