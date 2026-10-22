import { defineBlock, source } from '@burojs/core';
import { resourceByName } from '../../data/resource-by-name';
import { DEVICE_RESOURCE } from '../../data/resource-names';
import { LIVE_CAMERA_TEXTS } from './live-camera-texts';

/** The most cameras the wall shows at once (`source.list` allows 100). */
export const LIVE_WALL_LIMIT = 24;

/**
 * Every camera running recognition, live (`itap:live-wall`): a grid of live camera views, one per
 * camera with recognition on, of the facility chosen in the sidebar (all facilities when none
 * is), by name. Devices declare the facility scope, so the list follows the sidebar picker.
 */
export const liveWallBlock = defineBlock('itap:live-wall', {
  texts: {
    label: 'Live wall',
    none: 'No camera runs recognition here. Start recognition on a camera to watch it on the wall.',
    truncated: 'Showing the first {{shown}} of {{total}} cameras.',
    ...LIVE_CAMERA_TEXTS,
  },
  data: {
    cameras: () =>
      source.list(resourceByName(DEVICE_RESOURCE), {
        // Only cameras run recognition (the start action refuses other devices).
        where: [{ field: 'recognition_enabled', op: 'eq', value: true }],
        sort: [{ field: 'name', direction: 'asc' }],
        limit: LIVE_WALL_LIMIT,
        count: true,
      }),
  },
});
