/** Midnight of `now`'s local day, moved by `days`, as an ISO instant (the format of `timestamptz` filters). */
function localMidnight(now: Date, days: number): string {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days).toISOString();
}

/**
 * The visit list's saved views. A saved view is static data (buro has no relative date in a
 * filter), so "Today" and "Expected now" carry the moment the console was loaded: reload the
 * console to move them on (`tasks/ui/buro-gaps.md` G28).
 * - Today: visits whose expected window overlaps the local day.
 * - Expected now: scheduled visits whose window covers the load moment (due, not checked in).
 * - No-shows: visits the lifecycle job marked No-show, newest first.
 */
export function visitSavedViews(now: Date = new Date()) {
  const at = now.toISOString();
  return [
    {
      id: 'today',
      texts: 'Today',
      state: {
        filters: [
          { field: 'expected_start', op: 'lt', value: localMidnight(now, 1) },
          { field: 'expected_end', op: 'gte', value: localMidnight(now, 0) },
        ],
        sort: [{ field: 'expected_start', direction: 'asc' as const }],
      },
    },
    {
      id: 'expected-now',
      texts: 'Expected now',
      state: {
        filters: [
          { field: 'status', op: 'eq', value: 'scheduled' },
          { field: 'expected_start', op: 'lte', value: at },
          { field: 'expected_end', op: 'gte', value: at },
        ],
        sort: [{ field: 'expected_start', direction: 'asc' as const }],
      },
    },
    {
      id: 'no-shows',
      texts: 'No-shows',
      state: {
        filters: [{ field: 'status', op: 'eq', value: 'no_show' }],
        sort: [{ field: 'expected_start', direction: 'desc' as const }],
      },
    },
  ];
}
