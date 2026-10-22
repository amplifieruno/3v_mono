import { type BlockViewProps, useCustomQuery } from '@burojs/react';
import { Badge, Button } from '@burojs/ui-shadcn';
import { Bell, LogIn, LogOut, MapPin, Ticket } from 'lucide-react';
import * as React from 'react';
import type { identityTimelineBlock } from './identity-timeline-block';
import {
  type PlaceNames,
  TIMELINE_MAX,
  TIMELINE_PAGE,
  type TimelineEntry,
  identityTimeline,
  placeIdsOf,
  timelinePlaceNames,
} from './identity-timeline-query';
import { byDay, entryLine, severityVariant } from './timeline-entry';

type TimelineProps = BlockViewProps<typeof identityTimelineBlock>;
type TimelineT = TimelineProps['t'];

const ICONS: Readonly<Record<string, typeof Bell>> = {
  session_started: LogIn,
  session_ended: LogOut,
  location: MapPin,
  event: Bell,
  visit_checked_in: Ticket,
  visit_checked_out: Ticket,
};

const time = (value: string): string => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** One entry: the time, what happened, where, the camera and the event's severity. */
function Entry({ entry, names, own, t }: {
  readonly entry: TimelineEntry;
  readonly names: PlaceNames;
  readonly own: boolean;
  readonly t: TimelineT;
}): React.ReactElement {
  const line = entryLine(entry, names, t('unknownPlace'));
  const Icon = ICONS[entry.kind] ?? Bell;
  const point = entry.access_point_id === null ? undefined : names[entry.access_point_id];
  const device = entry.device_id === null ? undefined : names[entry.device_id];
  const area = entry.kind !== 'location' && entry.area_id !== null ? names[entry.area_id] : undefined;
  const where = [area, point].filter((part): part is string => part !== undefined);
  return (
    <li data-testid="timeline-entry" data-kind={entry.kind} className="flex gap-3 text-sm">
      <span className="w-16 shrink-0 whitespace-nowrap tabular-nums text-muted-foreground">{time(entry.occurred_at)}</span>
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2">
          {t(line.key, { params: line.params })}
          {entry.kind === 'event' && entry.severity !== null ? (
            <Badge variant={severityVariant(entry.severity)}>{entry.severity}</Badge>
          ) : null}
        </span>
        {where.length > 0 || device !== undefined || !own ? (
          <span className="text-xs text-muted-foreground">
            {[
              ...(where.length > 0 ? [t('at', { params: { name: where.join(' · ') } })] : []),
              ...(device === undefined ? [] : [t('camera', { params: { name: device } })]),
              ...(own ? [] : [t('merged')]),
            ].join(' · ')}
          </span>
        ) : null}
      </div>
    </li>
  );
}

/** The identity's timeline (`itap:identity-timeline`), newest first, grouped by day. */
export function IdentityTimelineView({ props, t }: TimelineProps): React.ReactElement {
  const identityId = props.identityId ?? null;
  const [limit, setLimit] = React.useState(TIMELINE_PAGE);
  const timeline = useCustomQuery(identityTimeline, { identityId: identityId ?? '', limit }, {
    enabled: identityId !== null,
  });
  // "Show older" keeps the entries on screen while the longer list loads.
  const last = React.useRef<readonly TimelineEntry[] | undefined>(undefined);
  if (timeline.data !== undefined) last.current = timeline.data;
  const loaded = timeline.data ?? last.current;
  const entries = loaded ?? [];
  const places = placeIdsOf(entries);
  const names = useCustomQuery(timelinePlaceNames, places, { enabled: entries.length > 0 });
  if (timeline.isError) return <p className="text-sm text-destructive">{t('failed')}</p>;
  if (loaded === undefined) return <p className="text-sm text-muted-foreground">{t('loading')}</p>;
  if (entries.length === 0) {
    return (
      <p data-testid="identity-timeline" className="text-sm text-muted-foreground">
        {t('none')}
      </p>
    );
  }
  const known = names.data ?? {};
  return (
    <section data-testid="identity-timeline" aria-label={t('label')} className="flex flex-col gap-4">
      {byDay(entries).map((group) => (
        <div key={group.day} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{group.day}</h3>
          <ol className="flex flex-col gap-2 border-l pl-3">
            {group.entries.map((entry, index) => (
              <Entry
                key={`${entry.occurred_at}-${entry.kind}-${index}`}
                entry={entry}
                names={known}
                own={entry.identity_id === identityId}
                t={t}
              />
            ))}
          </ol>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {t('shown', { params: { count: entries.length } })}
        {entries.length >= limit && limit < TIMELINE_MAX ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={timeline.isFetching}
            onClick={() => setLimit((current) => Math.min(current + TIMELINE_PAGE, TIMELINE_MAX))}
          >
            {t('older')}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
