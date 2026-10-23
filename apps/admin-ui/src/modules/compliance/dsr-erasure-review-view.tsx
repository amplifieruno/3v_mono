import { type BlockViewProps, useCustomQuery } from '@burojs/react';
import { Icon } from '@burojs/ui-shadcn';
import { TriangleAlert } from 'lucide-react';
import type * as React from 'react';
import { NAV_ICONS } from '../../app/nav';
import { LEGAL_HOLD_RESOURCE } from '../../data/resource-names';
import { formatDateTime, instantOf } from '../../fields/date-time-format';
import { RecordLink } from '../access/record-link';
import type { dsrErasureReviewBlock } from './dsr-erasure-review-block';
import { dataSubject } from './dsr-subject-query';
import { type HeldBy, legalHoldsCovering, noticeInput } from './hold-notice-query';

type Props = BlockViewProps<typeof dsrErasureReviewBlock>;
type T = Props['t'];

function HoldList({ holds, t }: { readonly holds: readonly HeldBy[]; readonly t: T }): React.ReactElement {
  return (
    <div role="status" data-testid="dsr-erasure-held" className="flex flex-col gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
      <p className="flex items-center gap-2 font-medium">
        <Icon name={NAV_ICONS.legalHolds} className="size-4 shrink-0" />
        {t('heldTitle')}
      </p>
      <p>{t('held')}</p>
      <ul className="flex flex-col gap-0.5">
        {holds.map((hold) => {
          const since = instantOf(hold.starts_at);
          const end = instantOf(hold.ends_at);
          return (
            <li key={hold.id} className="flex flex-wrap items-center gap-1">
              <RecordLink resource={LEGAL_HOLD_RESOURCE} id={hold.id} name={hold.name} fallback={hold.name} />
              <span className="text-muted-foreground">
                {t('holdPeriod', {
                  params: {
                    since: since === null ? '—' : formatDateTime(since),
                    until: end === null ? t('untilFurther') : t('until', { params: { at: formatDateTime(end) } }),
                  },
                })}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The erasure review (`itap:dsr-erasure-review`): who is erased, what goes, and the legal holds in
 * force that keep part of it (then the request completes partially). Reads the holds the hold
 * notice reads (the person and their identities).
 */
export function DsrErasureReviewView({ props, t }: Props): React.ReactElement {
  const profileId = typeof props.profileId === 'string' && props.profileId !== '' ? props.profileId : null;
  const subject = useCustomQuery(dataSubject, { profileId: profileId ?? '' }, { enabled: profileId !== null });
  const holds = useCustomQuery(legalHoldsCovering, noticeInput({ profileId }), { enabled: profileId !== null });
  if (profileId === null) return <p className="text-sm text-muted-foreground">{t('choose')}</p>;
  if (subject.data === undefined && !subject.isError) return <p className="text-sm text-muted-foreground">{t('loading')}</p>;
  const person = subject.data ?? null;
  if (person === null) return <p className="text-sm text-destructive">{t('missing')}</p>;
  const held = holds.data ?? [];
  return (
    <section className="flex flex-col gap-2 text-sm" data-testid="dsr-erasure-review" data-held={held.length > 0 ? 'true' : 'false'}>
      <p className="font-medium" data-testid="dsr-erasure-subject">
        {t('subject', { params: { name: `${person.first_name} ${person.last_name}`, code: person.code, identities: person.identities } })}
      </p>
      {person.erased_at === null ? null : <p className="text-muted-foreground">{t('erased')}</p>}
      {person.processing_restricted ? <p className="text-muted-foreground">{t('restricted')}</p> : null}
      <p className="font-medium">{t('erasesTitle')}</p>
      <ul className="list-disc pl-5">
        {t('erases')
          .split('|')
          .map((line) => (
            <li key={line}>{line}</li>
          ))}
      </ul>
      {held.length > 0 ? <HoldList holds={held} t={t} /> : holds.data === undefined ? null : <p className="text-muted-foreground">{t('notHeld')}</p>}
      <p role="alert" className="flex items-start gap-2 text-destructive">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t('irreversible')}
      </p>
    </section>
  );
}
