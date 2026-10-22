import * as React from 'react';

export interface TileBoundaryProps {
  /** What the tile shows when its view throws while drawing. */
  readonly fallback: React.ReactNode;
  readonly children: React.ReactNode;
}

/**
 * Keeps a widget that throws while drawing inside its own tile, so the rest of the dashboard draws.
 * A class: React offers error boundaries only as class components (no hook catches a render error).
 */
export class TileBoundary extends React.Component<TileBoundaryProps, { readonly failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { readonly failed: boolean } {
    return { failed: true };
  }

  override render(): React.ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
