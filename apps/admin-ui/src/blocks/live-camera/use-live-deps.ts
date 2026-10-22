import type { ItapAuthProvider } from '../../auth';
import { useConsole } from '../../app/console-context';
import { loadSocketIoFactory } from '../../realtime/socket-io';
import { attachHlsStream } from './hls-player';
import type { LiveCameraDeps } from './live-camera-panel';

/** One set of live dependencies per auth provider: the views of a session share its detection hub. */
const bySession = new WeakMap<ItapAuthProvider, LiveCameraDeps>();

/**
 * The live view's real dependencies: hls.js playback, the Socket.io client (both loaded on
 * demand) and the organization token of the console's auth provider, with its token store so
 * an organization switch closes the socket. The same object for every view of the session, so
 * all of them (a camera page, the live wall's tiles, the operator workspace) receive their
 * detections over one connection.
 */
export function useLiveDeps(): LiveCameraDeps {
  const { auth, store } = useConsole();
  const known = bySession.get(auth);
  if (known !== undefined && known.store === store) return known;
  const deps: LiveCameraDeps = {
    attach: attachHlsStream,
    loadSocket: loadSocketIoFactory,
    getToken: () => auth.getToken(),
    store,
  };
  bySession.set(auth, deps);
  return deps;
}
