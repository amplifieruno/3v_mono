import * as React from 'react';
import { useConsole } from '../../app/console-context';
import { loadSocketIoFactory } from '../../realtime/socket-io';
import { attachHlsStream } from './hls-player';
import type { LiveCameraDeps } from './live-camera-panel';

/**
 * The live view's real dependencies: hls.js playback, the Socket.io client (both loaded on
 * demand) and the organization token of the console's auth provider, with its token store so
 * an organization switch closes the socket.
 */
export function useLiveDeps(): LiveCameraDeps {
  const { auth, store } = useConsole();
  return React.useMemo(
    () => ({
      attach: attachHlsStream,
      loadSocket: loadSocketIoFactory,
      getToken: () => auth.getToken(),
      store,
    }),
    [auth, store],
  );
}
