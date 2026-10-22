/** The local calendar day of `now` as `YYYY-MM-DD` (the format of `date` columns). */
export function isoDay(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * The profile list's saved views. A saved view is static data (buro has no relative date in a
 * filter), so "Visitors today" carries the day the console was loaded: reload the console after
 * midnight to move it on (`tasks/ui/buro-gaps.md` G28).
 */
export function profileSavedViews(now: Date = new Date()) {
  const today = isoDay(now);
  return [
    {
      id: 'employees',
      texts: 'Employees',
      state: { filters: [{ field: 'profile_type', op: 'eq', value: 'employee' }] },
    },
    {
      id: 'visitors-today',
      texts: 'Visitors today',
      state: {
        filters: [
          { field: 'profile_type', op: 'eq', value: 'visitor' },
          { field: 'start_date', op: 'lte', value: today },
          { field: 'end_date', op: 'gte', value: today },
        ],
      },
    },
    {
      id: 'blacklisted',
      texts: 'Blacklisted',
      state: { filters: [{ field: 'is_blacklisted', op: 'eq', value: true }] },
    },
    {
      id: 'pending-face',
      texts: 'Pending face link',
      state: {
        filters: [
          { field: 'has_face', op: 'eq', value: false },
          { field: 'status', op: 'eq', value: 'active' },
        ],
      },
    },
  ];
}
