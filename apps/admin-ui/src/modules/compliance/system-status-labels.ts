import type { BlockViewProps } from '@burojs/react';
import { formatDateTime, instantOf } from '../../fields/date-time-format';
import { SYSTEM_STATUS_TEXTS, type systemStatusBlock } from './system-status-block';
import { humanize } from './system-status-format';

export type T = BlockViewProps<typeof systemStatusBlock>['t'];
type Key = keyof typeof SYSTEM_STATUS_TEXTS;

/** A probe, cron or queue name through its label (`<prefix>_<name>`), or the name in words. */
export function nameOf(t: T, prefix: 'check' | 'cron' | 'queue', name: string): string {
  const key = `${prefix}_${name}`;
  return Object.hasOwn(SYSTEM_STATUS_TEXTS, key) ? t(key as Key) : humanize(name);
}

/** A time as "dd/mm/yyyy, hh:mm", or `fallback`. */
export function timeOf(value: string | null, fallback: string): string {
  const at = instantOf(value);
  return at === null ? fallback : formatDateTime(at);
}

