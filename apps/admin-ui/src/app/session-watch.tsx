import { useDataRuntime } from '@burojs/react';
import * as React from 'react';
import { type WatchedStore, followStoreChange, seenOf } from './session-follow';

/** Runs {@link followStoreChange} for every change of the token store, in order. */
export function SessionWatch({ store }: { store: WatchedStore }): null {
  const { dataSession } = useDataRuntime();

  React.useEffect(() => {
    let seen = seenOf(store);
    let queue: Promise<void> = Promise.resolve();
    return store.subscribe(({ external }) => {
      const previous = seen;
      const next = seenOf(store);
      seen = next;
      queue = queue.then(() => followStoreChange(dataSession, previous, next, external)).catch(() => undefined);
    });
  }, [store, dataSession]);

  return null;
}
