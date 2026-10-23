import { type BlockViewProps, useCustomQuery } from '@burojs/react';
import { Icon } from '@burojs/ui-shadcn';
import { TriangleAlert } from 'lucide-react';
import type * as React from 'react';
import { NAV_ICONS } from '../../app/nav';
import { LEGAL_HOLD_RESOURCE } from '../../data/resource-names';
import { formatDateTime, instantOf } from '../../fields/date-time-format';
import { RecordLink } from '../access/record-link';
import { erasureHolds, splitErasureHolds } from './dsr-erasure-holds-query';
import type { dsrErasureReviewBlock } from './dsr-erasure-review-block';
import { dataSubject } from './dsr-subject-query';
import type { HeldBy } from './hold-notice-query';

type Props = BlockViewProps<typeof dsrErasureReviewBlock>;
type T = Props['t'];

interface HoldListProps {
  readonly holds: readonly HeldBy[];
  readonly title: string;
  readonly text: string;
  readonly testId: string;
  readonly t: T;
}

function HoldList({ holds, title, text, testId, t }: HoldListProps): React.ReactElement {
  return (
    <div role="status" data-testid={testId} className="flex flex-col gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
      <p className="flex items-center gap-2 font-medium">
        <Icon name={NAV_ICONS.legalHolds} className="size-4 shrink-0" />
        {title}
      </p>
      <p>{text}</p>
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

/** What the holds keep: a hold on the person (most is kept), holds on their incidents or facilities, none, or unknown. */
function HoldsSection({ profileId, t }: { readonly profileId: string; readonly t: T }): React.ReactElement {
  const holds = useCustomQuery(erasureHolds, { profileId });
  if (holds.isError) {
    return (
      <p role="alert" className="text-destructive" data-testid="dsr-erasure-holds-unknown">
        {t('holdsUnknown')}
      </p>
    );
  }
  if (holds.data === undefined) return <p className="text-muted-foreground">{t('holdsLoading')}</p>;
  const { person, places } = splitErasureHolds(holds.data);
  if (person.length === 0 && places.length === 0) return <p className="text-muted-foreground" data-testid="dsr-erasure-not-held">{t('notHeld')}</p>;
  return (
    <>
      {person.length === 0 ? null : <HoldList holds={person} title={t('personHeldTitle')} text={t('personHeld')} testId="dsr-erasure-person-held" t={t} />}
      {places.length === 0 ? null : <HoldList holds={places} title={t('placesHeldTitle')} text={t('placesHeld')} testId="dsr-erasure-held" t={t} />}
    </>
  );
}

/**
 * The erasure review (`itap:dsr-erasure-review`): who is erased, what goes, and the legal holds in
 * force the erasure honours (on the person, on incidents naming them, on facilities where they were
 * recorded), which make it partial. A hold read that fails says so (the flow then refuses to file).
 */
export function DsrErasureReviewView({ props, t }: Props): React.ReactElement {
  const profileId = typeof props.profileId === 'string' && props.profileId !== '' ? props.profileId : null;
  const subject = useCustomQuery(dataSubject, { profileId: profileId ?? '' }, { enabled: profileId !== null });
  if (profileId === null) return <p className="text-sm text-muted-foreground">{t('choose')}</p>;
  if (subject.data === undefined && !subject.isError) return <p className="text-sm text-muted-foreground">{t('loading')}</p>;
  const person = subject.data ?? null;
  if (person === null) return <p className="text-sm text-destructive">{t('missing')}</p>;
  return (
    <section className="flex flex-col gap-2 text-sm" data-testid="dsr-erasure-review">
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
      <HoldsSection profileId={profileId} t={t} />
      <p role="alert" className="flex items-start gap-2 text-destructive">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t('irreversible')}
      </p>
    </section>
  );
}
