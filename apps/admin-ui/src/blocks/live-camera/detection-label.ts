import type { DetectionMessage } from '../../realtime/detections';
import type { LiveCameraT } from './live-camera-texts';

export type BoxKind = 'known' | 'new' | 'identity' | 'unidentified';

/** How a face was recognised, which colours its box. */
export const boxKindOf = (message: DetectionMessage): BoxKind =>
  message.profileName
    ? 'known'
    : message.isNewIdentity
      ? 'new'
      : message.identityCode
        ? 'identity'
        : 'unidentified';

export const BOX_STROKE: Readonly<Record<BoxKind, string>> = {
  known: 'stroke-emerald-400',
  new: 'stroke-amber-400',
  identity: 'stroke-sky-400',
  unidentified: 'stroke-white/80',
};

export const BOX_FILL: Readonly<Record<BoxKind, string>> = {
  known: 'fill-emerald-300',
  new: 'fill-amber-300',
  identity: 'fill-sky-300',
  unidentified: 'fill-white',
};

/**
 * The label of a box: the profile name, "New", the identity code, or an unidentified face. `short`
 * (the wall's small tiles) keeps only the code's number (`IDENTITY-00165` -> `#00165`).
 */
export function boxLabel(message: DetectionMessage, t: LiveCameraT, short = false): string {
  if (message.profileName) return message.profileName;
  if (message.isNewIdentity) return t('newIdentity');
  if (!message.identityCode) return t('unidentified');
  const number = short ? /(\d+)$/.exec(message.identityCode)?.[1] : undefined;
  return number ? `#${number}` : message.identityCode;
}
