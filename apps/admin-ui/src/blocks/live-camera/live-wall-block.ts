import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';
import { LIVE_CAMERA_TEXTS } from './live-camera-texts';

/** The most cameras the wall shows at once. */
export const LIVE_WALL_LIMIT = 24;

/** How often the wall reads its camera list again, in milliseconds (recognition switched on or off elsewhere). */
export const LIVE_WALL_REFRESH_MS = 15_000;

/**
 * Every camera running recognition, live (`itap:live-wall`): the guard's monitor. A grid of
 * camera tiles (the picture fills each tile, with the recognised faces, a LIVE mark, the faces in
 * view, the camera's name and area), one per camera with recognition on, of the facility chosen
 * in the sidebar (all facilities when none is), by name. Beside it, unless `alerts` is off (the
 * operator workspace has its own events panel), the last hour's alerts, newest first, each with
 * the face the camera captured; a camera that saw a high or critical alert in the last 20 seconds
 * is ringed in red. Above, the number of cameras and the time. The view reads the cameras itself
 * (`useList`, every 15 seconds): a block's `source.list` cannot poll, and a camera switched on or
 * off elsewhere must join or leave the wall.
 */
export const liveWallBlock = defineBlock('itap:live-wall', {
  texts: {
    label: 'Live wall',
    none: 'No camera runs recognition here. Start recognition on a camera to watch it on the wall.',
    truncated: 'Showing the first {{shown}} of {{total}} cameras.',
    loadingCameras: 'Reading the cameras…',
    camerasFailed: 'The cameras could not be read.',
    cameras: '{{count}} cameras live',
    clock: 'Local time',
    live: 'Live',
    inView: '{{count}} in view',
    noArea: 'No area set',
    alerts: 'Alerts, last hour',
    alertsLoading: 'Reading the alerts…',
    alertsNone: 'No alerts in the last hour.',
    alertsFailed: 'The alerts could not be read.',
    ...LIVE_CAMERA_TEXTS,
  },
  props: {
    alerts: prop(z.boolean().optional()).default(true),
  },
});
