import type { PlaceNames, TimelineEntry } from './identity-timeline-query';

/** One entry's sentence: the block text key and its parameters. */
export interface EntryLine {
  readonly key: string;
  readonly params: Readonly<Record<string, string>>;
}

/** The block text key of an entry's sentence, by its kind (and movement or session status). */
function lineKey(entry: TimelineEntry): string {
  switch (entry.kind) {
    case 'session_ended':
      return entry.status === 'lost' ? 'kind_session_lost' : 'kind_session_ended';
    case 'location':
      return entry.movement_type === 'entry' || entry.movement_type === 'exit'
        ? `kind_${entry.movement_type}`
        : 'kind_location';
    case 'session_started':
    case 'visit_checked_in':
    case 'visit_checked_out':
    case 'event':
      return `kind_${entry.kind}`;
    default:
      return 'kind_event';
  }
}

/**
 * The sentence of an entry: where it happened by name (`unknown` when the place is not named),
 * the visit's code, or the event's title (its type when untitled).
 */
export function entryLine(entry: TimelineEntry, names: PlaceNames, unknown: string): EntryLine {
  const name = (id: string | null) => (id === null ? unknown : (names[id] ?? unknown));
  return {
    key: lineKey(entry),
    params: {
      facility: name(entry.facility_id),
      area: name(entry.area_id),
      code: entry.title ?? '',
      title: entry.title ?? entry.event_type ?? entry.kind,
    },
  };
}

/** Entries grouped by their local day, newest day first, in the order given. */
export function byDay(entries: readonly TimelineEntry[]): { readonly day: string; readonly entries: TimelineEntry[] }[] {
  const days: { day: string; entries: TimelineEntry[] }[] = [];
  for (const entry of entries) {
    const day = new Date(entry.occurred_at).toLocaleDateString();
    const last = days.at(-1);
    if (last?.day === day) last.entries.push(entry);
    else days.push({ day, entries: [entry] });
  }
  return days;
}

/** The badge variant of an event's severity. */
export function severityVariant(severity: string | null): 'destructive' | 'secondary' | 'outline' {
  if (severity === 'critical' || severity === 'high') return 'destructive';
  return severity === 'medium' ? 'secondary' : 'outline';
}
