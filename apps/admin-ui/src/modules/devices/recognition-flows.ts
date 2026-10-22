import { type FlowConfig, type FlowUnknownCheck, cond, ref } from '@burojs/core';
import { NAV_ICONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { DEVICE_RESOURCE } from '../../data/resource-names';
import { CAMERA_DEVICE_TYPES } from '../../enums/devices';
import { recognitionStart, recognitionStop } from './recognition';

const isCamera = cond.in(ref('record', 'device_type'), [...CAMERA_DEVICE_TYPES]);
const isOn = cond.equals(ref('record', 'recognition_enabled'), true);

/** The device header and row menu; never on the list toolbar (a flow of one device). */
const surfaces = { default: false, show: 'auto', row: 'auto' } as const;

/** The action's input: the device the flow runs on. */
const input = { deviceId: ref('record', 'id') };

/**
 * Check again after a lost answer: reads the device back; the toggle applied when its
 * `recognition_enabled` is `enabled`.
 */
export function recognitionApplied(enabled: boolean): FlowUnknownCheck {
  return async ({ record, data }) => {
    const id = record?.id;
    if (typeof id !== 'string' || id === '') return 'unknown';
    try {
      const { data: row } = await data.one(resourceByName(DEVICE_RESOURCE) as never, { id } as never);
      const current = (row as { readonly recognition_enabled?: unknown } | null)?.recognition_enabled;
      return current === enabled ? 'applied' : 'not-applied';
    } catch {
      return 'unknown';
    }
  };
}

/**
 * "Start recognition": offered on a camera whose recognition is off (`when`; a terminal or a
 * sensor never shows it). Refused before anything is sent when the camera is not active or has
 * no stream URL, the two cases the action refuses for a camera. The device and the status
 * facts re-read after it returns, so the header shows Stop and the real state.
 */
export const startRecognitionFlow = {
  texts: {
    label: 'Start recognition',
    notify: 'Recognition started.',
    doc: {
      summary:
        'Starts face recognition on the camera’s stream: the platform analyses its frames at the recognition rate and records the faces it finds as detections.',
    },
  },
  icon: NAV_ICONS.startRecognition,
  surfaces,
  when: cond.all([isCamera, cond.not(isOn)]),
  checks: [
    {
      id: 'recognitionInactive',
      severity: 'error',
      when: cond.not(cond.equals(ref('record', 'status'), 'active')),
      texts: 'Recognition runs on active cameras only. Set the camera’s status to Active first.',
    },
    {
      id: 'recognitionNoStream',
      severity: 'error',
      when: cond.not(cond.present(ref('record', 'stream_url'))),
      texts: 'The camera has no stream URL. Edit the camera and enter it first.',
    },
  ],
  submit: { mutation: recognitionStart, input, onUnknown: { check: recognitionApplied(true) } },
  then: { notify: true },
} satisfies FlowConfig;

/**
 * "Stop recognition": offered on a camera whose recognition is on. The session stops; the
 * detections recorded so far stay.
 */
export const stopRecognitionFlow = {
  texts: {
    label: 'Stop recognition',
    notify: 'Recognition stopped.',
    doc: {
      summary:
        'Stops face recognition on the camera; detections already recorded are kept. The live view still plays the stream.',
    },
  },
  icon: NAV_ICONS.stopRecognition,
  surfaces,
  when: cond.all([isCamera, isOn]),
  submit: { mutation: recognitionStop, input, onUnknown: { check: recognitionApplied(false) } },
  then: { notify: true },
} satisfies FlowConfig;
