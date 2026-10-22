import { defineMutation, defineQuery } from '@burojs/core';
import { f } from '@burojs/field-types';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { DEVICE_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';

/** The registry key the devices operations are bound under. */
export const DEVICES_BINDING = 'devices';

/** The Hasura action type `RecognitionStatus`: the camera's flag and its session's counters. */
export const recognitionStatusOutput = z.object({
  device_id: z.string(),
  enabled: z.boolean(),
  running: z.boolean(),
  fps: z.number(),
  frames_processed: z.number(),
  frames_dropped: z.number(),
  faces_detected: z.number(),
  faces_suppressed: z.number(),
  detections: z.number(),
  last_frame_at: z.string().nullable(),
  last_error: z.string().nullable(),
});

export type RecognitionStatus = z.infer<typeof recognitionStatusOutput>;

const recognitionInput = z.object({ deviceId: z.string().uuid() });

const STATUS_FIELDS = `device_id
    enabled
    running
    fps
    frames_processed
    frames_dropped
    faces_detected
    faces_suppressed
    detections
    last_frame_at
    last_error`;

/** One recognition action (`recognition_<name>(device_id)`) as the custom operation `operation`. */
function recognitionOperation(
  name: 'status' | 'start' | 'stop',
  operation: string,
  title: string,
) {
  const root = `recognition_${name}`;
  const kind = name === 'status' ? 'query' : 'mutation';
  return hasuraOperation(DEVICES_BINDING, operation, {
    kind,
    document: `${kind} ${title}($device: uuid!) {
  ${root}(device_id: $device) {
    ${STATUS_FIELDS}
  }
}`,
    variables: (input) => ({ device: (input as z.infer<typeof recognitionInput>).deviceId }),
    mapResult: (data) => {
      const status = recognitionStatusOutput.safeParse(rootOf(data, root));
      return status.success ? status.data : null;
    },
  });
}

export const recognitionStatusOperation = recognitionOperation(
  'status',
  'recognitionStatus',
  'RecognitionStatus',
);
export const recognitionStartOperation = recognitionOperation('start', 'recognitionStart', 'RecognitionStart');
export const recognitionStopOperation = recognitionOperation('stop', 'recognitionStop', 'RecognitionStop');

/**
 * What starting or stopping refreshes: the device (its `recognition_enabled`, which decides
 * which of the two flows is offered) and, through `reads`, the status facts on its header.
 */
export const RECOGNITION_EFFECTS = [{ resource: DEVICE_RESOURCE }];

/**
 * The live recognition state of one camera (action `recognition_status`): whether it is on,
 * whether this backend runs its session now, and the session's counters. Shown as facts on
 * the camera's header; a non-camera device is refused by the action, so only cameras place it.
 */
export const recognitionStatus = defineQuery('itap:recognition-status', {
  binding: recognitionStatusOperation.binding,
  input: schema(recognitionInput),
  output: schema(recognitionStatusOutput.nullable()),
  reads: [resourceByName(DEVICE_RESOURCE)],
  fields: {
    enabled: f.boolean({
      texts: {
        label: 'Recognition',
        doc: { summary: 'Whether recognition is switched on for the camera (Start / Stop recognition).' },
      },
    }),
    running: f.boolean({
      texts: {
        label: 'Running now',
        doc: {
          summary:
            'Whether the platform is analysing the camera’s stream at this moment. On but not running means it is starting, the camera is not active, or the last frame failed (see Last error).',
        },
      },
    }),
    frames_processed: f.number({
      texts: {
        label: 'Frames analysed',
        doc: { summary: 'Frames the running session has analysed since it started.' },
      },
    }),
    detections: f.number({
      texts: {
        label: 'Detections',
        doc: { summary: 'Faces the running session has recorded as detections since it started.' },
      },
    }),
    last_frame_at: f.dateTime({
      nullable: true,
      texts: { label: 'Last frame', doc: { summary: 'When the session last analysed a frame.' } },
    }),
    last_error: f.string({
      nullable: true,
      texts: {
        label: 'Last error',
        doc: {
          summary:
            'Why the last frame could not be analysed, such as the stream or the face recognition service being unreachable; empty when it worked.',
        },
      },
    }),
  },
});

/** The facts the camera header shows, in order. */
export const RECOGNITION_STATUS_ROWS = [
  'enabled',
  'running',
  'frames_processed',
  'detections',
  'last_frame_at',
  'last_error',
] as const;

/**
 * Switches recognition on for a camera (action `recognition_start`): sets
 * `recognition_enabled` as the caller (audited) and has the backend start the session. The
 * action refuses a device that is not a camera, has no stream URL or is not active.
 */
export const recognitionStart = defineMutation('itap:recognition-start', {
  binding: recognitionStartOperation.binding,
  input: schema(recognitionInput),
  output: schema(recognitionStatusOutput.nullable()),
  effects: RECOGNITION_EFFECTS,
});

/** Switches recognition off for a camera (action `recognition_stop`); the session stops. */
export const recognitionStop = defineMutation('itap:recognition-stop', {
  binding: recognitionStopOperation.binding,
  input: schema(recognitionInput),
  output: schema(recognitionStatusOutput.nullable()),
  effects: RECOGNITION_EFFECTS,
});
