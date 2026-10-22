import { implementBlock } from '@burojs/react';
import { liveCameraBlock } from './live-camera-block';
import { liveWallBlock } from './live-wall-block';

/**
 * The live views, for `<BuroProvider blockImplementations>` (via the devices views). Loaded on
 * demand: hls.js and socket.io-client stay out of the initial bundle.
 */
export const liveCameraView = implementBlock(liveCameraBlock, { load: () => import('./live-camera-view') });

export const liveWallView = implementBlock(liveWallBlock, { load: () => import('./live-wall-view') });
