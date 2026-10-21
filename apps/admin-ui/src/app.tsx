import type * as React from 'react';

/**
 * Placeholder root until the shell task mounts `BuroProvider` and `AppShell`.
 * It only proves the bundle boots with the framework's styles.
 */
export const App = (): React.ReactElement => (
  <main className="flex min-h-svh items-center justify-center bg-background text-foreground">
    <p className="text-muted-foreground text-sm">ITAP Console</p>
  </main>
);
