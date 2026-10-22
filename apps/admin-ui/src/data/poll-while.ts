import type { Query } from '@tanstack/react-query';

/**
 * A query's `refetchInterval` decided by its own latest answer: read again every `ms` while
 * `pending(data)` holds, never once it stops (TanStack Query calls the function after each answer).
 * buro 0.6 types `refetchInterval` as `number | false` but hands the option to TanStack Query
 * unchanged (`useQueryDescriptor`), so the function is passed through that type
 * (`tasks/ui/buro-gaps.md` G66).
 */
export function pollWhile<T>(pending: (data: T | undefined) => boolean, ms: number): number | false {
  const interval = (query: Query<T, Error, T, readonly unknown[]>): number | false => (pending(query.state.data) ? ms : false);
  return interval as unknown as number | false;
}
