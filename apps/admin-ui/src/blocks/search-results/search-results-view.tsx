import { resourceShowHref } from '@burojs/core';
import { type BlockViewProps, useApp, useCustomQuery } from '@burojs/react';
import { cn, useLinkComponent } from '@burojs/ui-shadcn';
import { CircleAlert, CircleCheck, LoaderCircle, SearchX } from 'lucide-react';
import type * as React from 'react';
import { pollWhile } from '../../data/poll-while';
import { SEARCH_REQUEST_RESOURCE } from '../../data/resource-names';
import { PhotoThumb } from '../../fields/photo-thumb';
import { BlockNote } from '../charts/block-note';
import { SearchResultCard } from './search-result-card';
import { type SearchOutcomeKind, searchOutcome, searchPolling, severalFaces } from './search-outcome';
import type { searchResultsBlock } from './search-results-block';
import { type SearchRun, searchRunQuery } from './search-results-query';

/** How often a search still queued or running is read again. */
export const SEARCH_POLL_MS = 1500;

const TEST_ID = 'search-results';

type T = BlockViewProps<typeof searchResultsBlock>['t'];

function outcomeText(outcome: SearchOutcomeKind, t: T): string {
  switch (outcome.kind) {
    case 'pending':
      return t('pending');
    case 'photo':
      return t(`photo_${outcome.reason}`);
    case 'error':
      // The server's own words stay out of the console (they may name internals).
      return t('error');
    case 'none':
      return t('none');
    case 'found':
      return outcome.count === 1 ? t('foundOne') : t('found', { params: { count: outcome.count } });
  }
}

const ICONS = { pending: LoaderCircle, photo: CircleAlert, error: CircleAlert, none: SearchX, found: CircleCheck } as const;

/** The searched photo, what became of the search, and how it was run. */
function OutcomeHeader({ run, t }: { readonly run: SearchRun; readonly t: T }): React.ReactElement {
  const outcome = searchOutcome(run);
  const Icon = ICONS[outcome.kind];
  const failed = outcome.kind === 'photo' || outcome.kind === 'error';
  const duration = run.duration_ms ?? 0;
  const meta =
    run.threshold === null
      ? t('metaAttribute', { params: { max: run.max_results, duration } })
      : t('meta', { params: { threshold: run.threshold.toFixed(2), max: run.max_results, duration } });
  return (
    <div className="flex flex-wrap items-start gap-3">
      {run.image_file_id === null ? null : (
        <PhotoThumb fileId={run.image_file_id} alt={t('searchedPhoto')} className="size-20" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
        <p
          role={failed ? 'alert' : 'status'}
          data-testid="search-outcome"
          data-outcome={outcome.kind}
          className={cn('flex items-start gap-2 font-medium', failed && 'text-destructive')}
        >
          <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', outcome.kind === 'pending' && 'animate-spin')} />
          <span>{outcomeText(outcome, t)}</span>
        </p>
        {severalFaces(run.face_count) ? (
          <p data-testid="search-several-faces" className="text-amber-700 dark:text-amber-400">
            {t('severalFaces', { params: { count: run.face_count ?? 0 } })}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {meta}
          {run.fuzzy && run.threshold !== null ? ` · ${t('fuzzyIncluded')}` : ''}
        </p>
      </div>
    </div>
  );
}

/**
 * The results block's view (`itap:search-results`): the outcome header, then the cards. Reads the
 * request again every {@link SEARCH_POLL_MS} while it is queued or running, for at most two minutes after it was made.
 */
export function SearchResultsView({ props, t }: BlockViewProps<typeof searchResultsBlock>): React.ReactElement {
  const app = useApp();
  const Link = useLinkComponent();
  const requestId = props.requestId ?? null;
  const run = useCustomQuery(
    searchRunQuery,
    { requestId: requestId ?? '' },
    { enabled: requestId !== null, refetchInterval: pollWhile<SearchRun | null>((run) => searchPolling(run, Date.now()), SEARCH_POLL_MS) },
  );

  if (requestId === null || run.isError || run.data === null) return <BlockNote testId={TEST_ID} tone="error">{t('unreadable')}</BlockNote>;
  if (run.data === undefined) return <BlockNote testId={TEST_ID}>{t('loading')}</BlockNote>;
  const data = run.data;
  return (
    <section data-testid={TEST_ID} aria-label={t('label')} className="flex flex-col gap-4">
      <OutcomeHeader run={data} t={t} />
      {data.results.length === 0 ? null : (
        <ol className="flex flex-wrap gap-3">
          {data.results.map((match) => (
            <SearchResultCard key={match.id} match={match} t={t} />
          ))}
        </ol>
      )}
      {props.showHistoryLink ? (
        <Link
          href={resourceShowHref(app.registry, app.registry.get(SEARCH_REQUEST_RESOURCE), SEARCH_REQUEST_RESOURCE, data.id)}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          {t('openHistory')}
        </Link>
      ) : null}
    </section>
  );
}
