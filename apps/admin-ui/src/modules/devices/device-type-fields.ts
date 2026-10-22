import { f } from '@burojs/field-types';
import { rangeValidator } from '../../fields/bounded-number';
import { checkStreamUrl } from './device-checks';

/** The columns only cameras use: the video stream and face recognition. */
export const cameraFields = {
  stream_url: f.string({
    nullable: true,
    validate: checkStreamUrl,
    texts: {
      label: 'Stream URL',
      description: 'For example rtsp://10.0.0.20/stream1, without the user name and password.',
      doc: {
        summary:
          'The address of the camera’s video stream. The stream-server publishes it under the last part of the address (the stream id), which the live view and the health check read. Credentials never go into the address: enter them as user name and password.',
      },
    },
  }),
  resolution: f.string({
    nullable: true,
    texts: {
      label: 'Resolution',
      doc: { summary: 'The stream’s frame size as the camera delivers it, such as 1920x1080.' },
    },
  }),
  fps: f.number({
    nullable: true,
    integer: true,
    validate: rangeValidator({ min: 1, integer: true }),
    texts: {
      label: 'Frame rate',
      doc: { summary: 'Frames per second the camera streams; a whole number above 0.' },
    },
  }),
  recognition_enabled: f.boolean({
    system: true,
    in: ['list', 'show'],
    texts: {
      label: 'Recognition on',
      doc: {
        summary:
          'Whether the platform runs face recognition on the camera’s stream. Changed only by starting or stopping recognition, never by editing the device.',
      },
    },
  }),
  recognition_fps: f.number({
    required: true,
    integer: true,
    default: 1,
    validate: rangeValidator({ min: 1, max: 5, integer: true }),
    texts: {
      label: 'Recognition rate',
      description: 'Frames per second analysed while recognition runs, 1 to 5.',
      doc: {
        summary:
          'How many frames per second recognition analyses, from 1 to 5. More finds people sooner and costs more processing.',
      },
    },
  }),
};

/** The columns only access terminals use: the state of the access policy sync (system-maintained). */
export const terminalFields = {
  policy_version_synced: f.number({
    system: true,
    in: ['list', 'show'],
    nullable: true,
    texts: {
      label: 'Policy version',
      doc: {
        summary:
          'The organization’s policy version the terminal last confirmed; behind the current one means the terminal decides on older policies until the next sync.',
      },
    },
  }),
  policy_synced_at: f.dateTime({
    system: true,
    in: ['list', 'show'],
    nullable: true,
    texts: {
      label: 'Policies synced',
      doc: { summary: 'When the terminal last confirmed the access policies; empty when it never did.' },
    },
  }),
  policy_sync_error: f.string({
    system: true,
    in: ['list', 'show'],
    nullable: true,
    texts: {
      label: 'Sync error',
      doc: { summary: 'Why the last policy push to the terminal failed; empty after a successful sync.' },
    },
  }),
};

/** The type-specific column names, which each record type hides from the others. */
export const CAMERA_FIELD_NAMES = Object.keys(cameraFields) as (keyof typeof cameraFields)[];
export const TERMINAL_FIELD_NAMES = Object.keys(terminalFields) as (keyof typeof terminalFields)[];
