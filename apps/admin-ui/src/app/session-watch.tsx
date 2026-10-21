import { useDataRuntime } from '@burojs/react';
import * as React from 'react';
import type { TokenStore } from '../auth';

/**
 * Ends the UI session when the token store loses its base session behind the
 * framework's back: a renewal whose refresh token was rejected clears the
 * store, but buro 0.6.0 runs no auth recovery for reads (gap G10), so nothing
 * else would notice. A forced sign-out rotation re-asks `check()`, and the
 * route guard sends the user to `/login`.
 */
export function SessionWatch({ store }: { store: Pick<TokenStore, 'snapshot' | 'subscribe'> }): null {
  const { dataSession } = useDataRuntime();

  React.useEffect(() => {
    let signedIn = store.snapshot().base !== null;
    return store.subscribe(() => {
      const now = store.snapshot().base !== null;
      if (signedIn && !now) void dataSession.rotateSession('forced-sign-out');
      signedIn = now;
    });
  }, [store, dataSession]);

  return null;
}
