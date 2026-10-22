import { type BlockViewProps, useCustomQuery } from '@burojs/react';
import { EnumBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { IDENTITY_STATUS_ENUM } from '../../enums/identities';
import { PhotoThumb } from '../../fields/photo-thumb';
import type { mergeRollbackReviewBlock } from './merge-rollback-review-block';
import { mergeRollbackPreview } from './merge-rollback-preview';

type RollbackProps = BlockViewProps<typeof mergeRollbackReviewBlock>;

/** The rollback review (`itap:merge-rollback-review`). */
export function MergeRollbackReviewView({ props, t }: RollbackProps): React.ReactElement {
  const mergeId = props.mergeId ?? null;
  const preview = useCustomQuery(mergeRollbackPreview, { mergeId: mergeId ?? '' }, { enabled: mergeId !== null });
  if (preview.data === undefined) return <p className="text-sm text-muted-foreground">{t('loading')}</p>;
  const merge = preview.data;
  if (merge === null) return <p className="text-sm text-destructive">{t('missing')}</p>;
  if (merge.status !== 'completed') return <p className="text-sm text-muted-foreground">{t('done')}</p>;
  const target = merge.target.code;
  return (
    <div className="flex flex-col gap-3" data-testid="merge-rollback-review">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('identity')}</TableHead>
              <TableHead>{t('now')}</TableHead>
              <TableHead>{t('restored')}</TableHead>
              <TableHead>{t('profile')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {merge.sources.map((source) => (
              <TableRow key={source.identity.id}>
                <TableCell>
                  <span className="flex items-center gap-2">
                    {source.identity.primary_photo_file_id === null ? null : (
                      <PhotoThumb fileId={source.identity.primary_photo_file_id} alt={source.identity.code} className="size-10" />
                    )}
                    {source.identity.code}
                  </span>
                </TableCell>
                <TableCell>
                  <EnumBadge enumName={IDENTITY_STATUS_ENUM} value={source.identity.status} />
                </TableCell>
                <TableCell>
                  <EnumBadge enumName={IDENTITY_STATUS_ENUM} value={source.previous_status} />
                </TableCell>
                <TableCell>
                  {source.previous_profile ?? <span className="text-muted-foreground">{t('noProfile')}</span>}
                  {source.previous_is_primary ? ` (${t('primary')})` : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-1 text-sm" data-testid="merge-rollback-effects">
        <p>{t('back', { params: { target } })}</p>
        <p>{t('kept', { params: { target } })}</p>
        {merge.inherited_profile === null ? null : (
          <p>{t('inherited', { params: { target, profile: merge.inherited_profile } })}</p>
        )}
        {merge.inherited_primary ? <p>{t('inheritedPrimary', { params: { target } })}</p> : null}
        {merge.closed_pairs > 0 ? <p>{t('pairs', { params: { count: merge.closed_pairs } })}</p> : null}
        <p className="text-muted-foreground">{t('cancelled')}</p>
      </div>
    </div>
  );
}
