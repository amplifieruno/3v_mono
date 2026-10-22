import { defineBlock } from '@burojs/core';
import { LIVE_CAMERA_TEXTS } from './live-camera-texts';

/** The most cameras the wall shows at once. */
export const LIVE_WALL_LIMIT = 24;

/** How often the wall reads its camera list again, in milliseconds (recognition switched on or off elsewhere). */
export const LIVE_WALL_REFRESH_MS = 15_000;

/**
 * Every camera running recognition, live (`itap:live-wall`): a grid of live camera views, one per
 * camera with recognition on, of the facility chosen in the sidebar (all facilities when none
 * is), by name. Devices declare the facility scope, so the list follows the sidebar picker. The
 * view reads the list itself (`useList`, every 15 seconds): a block's `source.list` cannot poll,
 * and a camera switched on or off elsewhere must join or leave the wall.
 */
export const liveWallBlock = defineBlock('itap:live-wall', {
  texts: {
    label: 'Live wall',
    none: 'No camera runs recognition here. Start recognition on a camera to watch it on the wall.',
    truncated: 'Showing the first {{shown}} of {{total}} cameras.',
    loadingCameras: 'Reading the cameras…',
    camerasFailed: 'The cameras could not be read.',
    ...LIVE_CAMERA_TEXTS,
  },
});
