import type * as React from 'react';
import { useLocation } from 'react-router';

/** Prints the router's current path, for tests that follow a navigation. */
export function LocationProbe(): React.ReactElement {
  return <output data-testid="location">{useLocation().pathname}</output>;
}
