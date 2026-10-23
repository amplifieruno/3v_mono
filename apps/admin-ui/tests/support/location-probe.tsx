import type * as React from 'react';
import { useLocation } from 'react-router';

export interface LocationProbeProps {
  /** Prints the query string and the hash too (for tests that check nothing leaked into the URL). */
  readonly full?: boolean;
}

/** Prints the router's current path, for tests that follow a navigation. */
export function LocationProbe({ full = false }: LocationProbeProps): React.ReactElement {
  const location = useLocation();
  return <output data-testid="location">{full ? `${location.pathname}${location.search}${location.hash}` : location.pathname}</output>;
}
