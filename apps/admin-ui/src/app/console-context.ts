import type { Resolver } from '@burojs/context';
import * as React from 'react';
import type { ItapAuthProvider, TokenStore } from '../auth';
import type { itapContextSlices } from './context-slices';

export type ItapResolver = Resolver<ReturnType<typeof itapContextSlices>>;

export interface ConsoleContextValue {
  readonly auth: ItapAuthProvider;
  readonly resolver: ItapResolver;
  /** The token store behind `auth`, for views that follow organization switches themselves. */
  readonly store?: Pick<TokenStore, 'snapshot' | 'subscribe'>;
}

/** Provided by `<AppRuntime>` (`./runtime.tsx`). */
export const ConsoleContext = React.createContext<ConsoleContextValue | null>(null);

/** The console's auth provider and resolver, for the switchers and the auth pages. */
export function useConsole(): ConsoleContextValue {
  const value = React.useContext(ConsoleContext);
  if (!value) throw new Error('useConsole() needs <AppRuntime>.');
  return value;
}
