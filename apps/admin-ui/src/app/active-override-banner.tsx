import { useList, useT } from '@burojs/react';
import { Siren } from 'lucide-react';
import type * as React from 'react';
import { useEnumLabel } from '../blocks/charts/use-enum-label';
import { EMERGENCY_OVERRIDE_RESOURCE } from '../data/resource-names';
import { OVERRIDE_MODE_ENUM } from '../enums/access';
import { formatDateTime, instantOf } from '../fields/date-time-format';
import { RecordLink } from '../modules/access/record-link';
import { type ActiveOverride, OVERRIDE_BANNER_POLL_MS, activeOverrides } from './active-overrides';

/** At most this many active overrides are named; the rest are counted. */
const SHOWN = 3;

/**
 * The shell's emergency banner: every emergency override active now in the facility selected in
 * the sidebar (every facility when none is), with its mode, facility and end, linked to its page.
 * Drawn above every page (`app.tsx`; buro's shell has no banner slot, `tasks/ui/buro-gaps.md`
 * G76); nothing when none is active.
 */
export function ActiveOverrideBanner(): React.ReactElement | null {
  const t = useT();
  const modeLabel = useEnumLabel(OVERRIDE_MODE_ENUM);
  const overrides = useList(EMERGENCY_OVERRIDE_RESOURCE, {
    filter: { field: 'ended_at', op: 'isNull' },
    sort: [{ field: 'started_at', direction: 'desc' }],
    pagination: { kind: 'offset', page: 1, pageSize: 20 },
    relationColumns: ['facility_id.name'],
    refetchInterval: OVERRIDE_BANNER_POLL_MS,
  });
  const rows = activeOverrides((overrides.data?.data ?? []) as readonly ActiveOverride[]);
  if (rows.length === 0) return null;
  return (
    <div
      role="status"
      data-testid="override-banner"
      className="mb-4 flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
    >
      {rows.slice(0, SHOWN).map((row) => {
        const ends = instantOf(row.ends_at);
        const text = t('console.overrideBanner.active', {
          params: {
            mode: modeLabel(row.mode),
            facility: row['facility_id.name'] ?? t('console.overrideBanner.facility'),
            until: ends === null ? '—' : formatDateTime(ends),
          },
        });
        return (
          <p key={row.id} className="flex items-center gap-2" data-testid="override-banner:item">
            <Siren aria-hidden="true" className="size-4 shrink-0 text-destructive" />
            <span className="font-medium">{text}</span>
            <RecordLink resource={EMERGENCY_OVERRIDE_RESOURCE} id={row.id} name={t('console.overrideBanner.open')} fallback="" />
          </p>
        );
      })}
      {rows.length > SHOWN ? (
        <p className="text-muted-foreground">{t('console.overrideBanner.more', { params: { count: rows.length - SHOWN } })}</p>
      ) : null}
    </div>
  );
}
