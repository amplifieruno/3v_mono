import { defineCustomPage } from '@burojs/core';
import { liveWallBlock } from '../../blocks/live-camera/live-wall-block';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';

/**
 * "Live wall" in the sidebar: every camera running recognition in the facility chosen in the
 * sidebar, live with the faces recognised on it.
 */
export const liveWallPage = defineCustomPage({
  name: 'live-wall',
  icon: NAV_ICONS.liveWall,
  path: '/live-wall',
  texts: 'Live wall',
  section: NAV_SECTIONS.devices,
  order: 5,
  body: (l) => [l.place(liveWallBlock, { key: 'live-wall' })],
});
