import { absent, defineBlock, prop, source } from '@burojs/core';
import { z } from 'zod';
import { resourceByName } from '../../data/resource-by-name';
import { DEVICE_RESOURCE } from '../../data/resource-names';
import { LIVE_CAMERA_TEXTS } from './live-camera-texts';

/**
 * One camera live (`itap:live-camera`): its HLS stream from the stream-server (stream id = last
 * path segment of `stream_url`) with the faces recognised on it drawn as labelled boxes that
 * fade after two seconds, received over the backend's Socket.io room of the camera with the
 * organization token, and counters of what arrived. Prop `deviceId` (the camera page passes its
 * record); the device is read by id, named rather than imported because the device page places
 * this block. The view (and hls.js and socket.io-client with it) loads only when placed.
 */
export const liveCameraBlock = defineBlock('itap:live-camera', {
  texts: { label: 'Live view', none: 'No camera.', ...LIVE_CAMERA_TEXTS },
  props: {
    deviceId: prop(z.string().nullable().optional()).default(null),
  },
  data: {
    device: ({ props }) =>
      props.deviceId ? source.one(resourceByName(DEVICE_RESOURCE), props.deviceId) : absent(),
  },
});
