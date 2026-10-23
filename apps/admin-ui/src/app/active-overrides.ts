import { instantOf } from '../fields/date-time-format';

/** How often the banner reads again: an override started elsewhere shows within half a minute. */
export const OVERRIDE_BANNER_POLL_MS = 30_000;

/** An override as the banner reads it. */
export interface ActiveOverride {
  readonly id: string;
  readonly mode: string;
  readonly ends_at: string;
  readonly facility_id?: string;
}

/** The rows still deciding at `now`: not ended and not run out (the minute job closes those). */
export function activeOverrides(rows: readonly ActiveOverride[], now: number = Date.now()): ActiveOverride[] {
  return rows.filter((row) => {
    const ends = instantOf(row.ends_at);
    return ends === null || ends > now;
  });
}
