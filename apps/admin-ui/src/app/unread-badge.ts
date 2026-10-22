/** The unread count as the bell's badge shows it: up to 99, then "99+". */
export function unreadBadge(count: number): string {
  return count > 99 ? '99+' : String(count);
}
