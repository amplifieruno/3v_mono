import { resourceShowHref } from '@burojs/core';
import { type BlockViewProps, useApp } from '@burojs/react';
import { EnumBadge, useLinkComponent } from '@burojs/ui-shadcn';
import { ImageOff } from 'lucide-react';
import type * as React from 'react';
import { IDENTITY_RESOURCE, PROFILE_RESOURCE } from '../../data/resource-names';
import { IDENTITY_STATUS_ENUM } from '../../enums/identities';
import { PROFILE_TYPE_ENUM } from '../../enums/people';
import { SEARCH_MATCH_TYPE_ENUM } from '../../enums/search';
import { PhotoThumb } from '../../fields/photo-thumb';
import { confidenceText } from './search-outcome';
import type { searchResultsBlock } from './search-results-block';
import type { SearchMatch } from './search-results-query';

export interface SearchResultCardProps {
  readonly match: SearchMatch;
  readonly t: BlockViewProps<typeof searchResultsBlock>['t'];
}

/** One identity found: its best photo, code and status, the person, the similarity and the match type. */
export function SearchResultCard({ match, t }: SearchResultCardProps): React.ReactElement {
  const app = useApp();
  const Link = useLinkComponent();
  const { identity, profile } = match;
  const href = (resource: string, id: string): string => resourceShowHref(app.registry, app.registry.get(resource), resource, id);
  return (
    <li
      data-testid="search-result"
      data-match-type={match.match_type}
      className="flex w-44 flex-col gap-2 rounded-md border bg-card p-2 text-sm"
    >
      <div className="relative">
        {identity?.primary_photo_file_id ? (
          <PhotoThumb
            fileId={identity.primary_photo_file_id}
            alt={t('identityPhoto', { params: { code: identity.code } })}
            className="size-40"
          />
        ) : (
          <span className="flex size-40 items-center justify-center rounded-md border bg-muted/30 text-muted-foreground">
            <ImageOff className="size-5" aria-label={t('noPhoto')} />
          </span>
        )}
        <span className="absolute left-1 top-1 rounded bg-background/80 px-1 text-xs font-medium tabular-nums">
          {t('rank', { params: { rank: match.rank } })}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <EnumBadge enumName={SEARCH_MATCH_TYPE_ENUM} value={match.match_type} />
        {match.confidence === null ? null : (
          <span className="text-xs tabular-nums text-muted-foreground">
            {t('similarity', { params: { value: confidenceText(match.confidence) } })}
          </span>
        )}
      </div>
      {identity === null ? (
        <span className="text-muted-foreground">{t('identityGone')}</span>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          <Link href={href(IDENTITY_RESOURCE, identity.id)} className="font-medium hover:underline">
            {identity.code}
          </Link>
          <EnumBadge enumName={IDENTITY_STATUS_ENUM} value={identity.status} />
        </div>
      )}
      {profile === null ? (
        <span className="text-muted-foreground">{t('noProfile')}</span>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          <Link href={href(PROFILE_RESOURCE, profile.id)} className="min-w-0 truncate hover:underline">
            {profile.full_name ?? profile.id}
          </Link>
          <EnumBadge enumName={PROFILE_TYPE_ENUM} value={profile.profile_type} />
        </div>
      )}
    </li>
  );
}
