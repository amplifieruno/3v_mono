import { type BlockViewProps, useCustomQuery } from '@burojs/react';
import { Badge, EnumBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@burojs/ui-shadcn';
import { TriangleAlert } from 'lucide-react';
import type * as React from 'react';
import { IDENTITY_STATUS_ENUM } from '../../enums/identities';
import { PhotoThumb } from '../../fields/photo-thumb';
import { mergeEffect, mergeProblems, mergeSides } from './identity-merge-plan';
import { type MergeIdentity, identityMergePreview } from './identity-merge-preview';
import type { identityMergeReviewBlock } from './identity-merge-review-block';

type ReviewProps = BlockViewProps<typeof identityMergeReviewBlock>;
type ReviewT = ReviewProps['t'];

/** The rows of the comparison, each a cell per identity. */
const ROWS = [
  'photo',
  'status',
  'profile',
  'photos',
  'templates',
  'watch_list_entries',
  'open_pairs',
  'pending_verifications',
] as const;

type RowKey = (typeof ROWS)[number];

/** One identity's cell of a row. */
function cell(row: RowKey, identity: MergeIdentity, t: ReviewT): React.ReactNode {
  switch (row) {
    case 'photo':
      return identity.primary_photo_file_id === null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <PhotoThumb fileId={identity.primary_photo_file_id} alt={identity.code} className="size-16" />
      );
    case 'status':
      return <EnumBadge enumName={IDENTITY_STATUS_ENUM} value={identity.status} />;
    case 'profile':
      return identity.profile ?? <span className="text-muted-foreground">{t('noProfile')}</span>;
    default:
      return identity[row];
  }
}

/** A warning line under the comparison. */
function Warning({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  return (
    <p role="alert" className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

/** What the merge moves and closes, and that it can be rolled back. */
function Effect({ target, sources, t }: {
  readonly target: MergeIdentity;
  readonly sources: readonly MergeIdentity[];
  readonly t: ReviewT;
}): React.ReactElement {
  const effect = mergeEffect(target, sources);
  return (
    <div className="flex flex-col gap-1 text-sm" data-testid="identity-merge-moves">
      <p>
        {t('moves', {
          params: {
            photos: effect.photos,
            templates: effect.templates,
            entries: effect.watchListEntries,
            target: target.code,
            sources: sources.map((row) => row.code).join(', '),
          },
        })}
      </p>
      {effect.inheritedProfile === null ? null : (
        <p>{t('inherits', { params: { target: target.code, profile: effect.inheritedProfile } })}</p>
      )}
      <p>{t('closes', { params: { pairs: effect.openPairs, verifications: effect.pendingVerifications } })}</p>
      <p className="text-muted-foreground">{t('rollback')}</p>
    </div>
  );
}

/** The merge review (`itap:identity-merge-review`). */
export function IdentityMergeReviewView({ props, t }: ReviewProps): React.ReactElement {
  const { targetId, sourceIds } = mergeSides(props);
  const ids = [...(targetId === null ? [] : [targetId]), ...sourceIds];
  const preview = useCustomQuery(identityMergePreview, { ids }, { enabled: ids.length > 0 });
  const rows = preview.data ?? [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const target = targetId === null ? null : (byId.get(targetId) ?? null);
  const sources = sourceIds.flatMap((id) => {
    const row = byId.get(id);
    return row === undefined ? [] : [row];
  });
  if (targetId !== null && sourceIds.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('choose', { params: { code: target?.code ?? '' } })}</p>;
  }
  if (preview.data === undefined) return <p className="text-sm text-muted-foreground">{t('loading')}</p>;
  if ((targetId !== null && target === null) || sources.length < sourceIds.length) {
    return <p className="text-sm text-destructive">{t('missing')}</p>;
  }
  const shown = target === null ? sources : [target, ...sources];
  const problems = target === null ? [] : mergeProblems(target, sources);
  return (
    <div className="flex flex-col gap-3" data-testid="identity-merge-review">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('field')}</TableHead>
              {shown.map((row) => (
                <TableHead key={row.id}>
                  <span className="flex flex-wrap items-center gap-2">
                    {row.code}
                    {target === null ? null : (
                      <Badge variant="outline">{t(row.id === target.id ? 'kept' : 'mergedAway')}</Badge>
                    )}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ROWS.map((key) => (
              <TableRow key={key}>
                <TableCell className="text-muted-foreground">{t(`row_${key}`)}</TableCell>
                {shown.map((row) => (
                  <TableCell key={row.id}>{cell(key, row, t)}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {problems.map((problem) => (
        <Warning key={`${problem.kind}-${'code' in problem ? problem.code : ''}`}>
          {t(`problem_${problem.kind}`, { params: 'code' in problem ? { code: problem.code } : {} })}
        </Warning>
      ))}
      {target === null || problems.length > 0 ? null : <Effect target={target} sources={sources} t={t} />}
    </div>
  );
}
