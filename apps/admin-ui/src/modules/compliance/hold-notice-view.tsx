import { type BlockViewProps, useCustomQuery } from '@burojs/react';
import { Icon } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { NAV_ICONS } from '../../app/nav';
import { LEGAL_HOLD_RESOURCE } from '../../data/resource-names';
import { formatDateTime, instantOf } from '../../fields/date-time-format';
import { RecordLink } from '../access/record-link';
import type { legalHoldNoticeBlock } from './hold-notice-block';
import { type HeldBy, legalHoldsCovering, noticeInput, one } from './hold-notice-query';

type Props = BlockViewProps<typeof legalHoldNoticeBlock>;
type BlockProps = Props['props'];

/** Which sentence heads the notice: the record's kind. */
function kindOf(props: BlockProps): 'profile' | 'identity' | 'incident' {
  if (one(props.incidentId).length > 0) return 'incident';
  return one(props.identityId).length > 0 ? 'identity' : 'profile';
}

/**
 * The legal hold notice of a record page (`itap:legal-hold-notice`): nothing unless a hold in
 * force covers the record; then a warning naming each hold, since when and until when, linked to
 * it.
 */
export function LegalHoldNoticeView({ props, t }: Props): React.ReactElement | null {
  const input = noticeInput(props);
  const enabled = Object.values(input).some((list) => list.length > 0);
  const holds = useCustomQuery(legalHoldsCovering, input, { enabled });
  const rows: readonly HeldBy[] = holds.data ?? [];
  if (!enabled || rows.length === 0) return null;
  const kind = kindOf(props);
  return (
    <div role="status" data-testid="legal-hold-notice" className="flex flex-col gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <Icon name={NAV_ICONS.legalHolds} className="size-4 shrink-0" />
        {t('title')}
      </p>
      <p className="text-muted-foreground">{t(kind)}</p>
      <ul className="flex flex-col gap-0.5">
        {rows.map((hold) => {
          const since = instantOf(hold.starts_at);
          const end = instantOf(hold.ends_at);
          const indirect = !hold.via.includes(kind);
          return (
            <li key={hold.id} data-testid="legal-hold-notice:item" className="flex flex-wrap items-center gap-1">
              <RecordLink resource={LEGAL_HOLD_RESOURCE} id={hold.id} name={hold.name} fallback={hold.name} />
              <span>
                {t('period', {
                  params: {
                    since: since === null ? '—' : formatDateTime(since),
                    until: end === null ? t('untilFurther') : t('until', { params: { at: formatDateTime(end) } }),
                  },
                })}
              </span>
              {indirect ? (
                <span className="text-muted-foreground">{t(hold.via.includes('facility') ? 'viaFacility' : 'viaLink')}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
