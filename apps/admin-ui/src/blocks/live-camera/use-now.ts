import * as React from 'react';

/** The current time, updated every `everyMs` milliseconds (the wall's clock and its fading tile alerts). */
export function useNow(everyMs = 1_000): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(timer);
  }, [everyMs]);
  return now;
}
