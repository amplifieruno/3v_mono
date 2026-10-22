import { type BlockViewProps, useCustomQuery, useQuick } from '@burojs/react';
import {
  Button,
  EnumBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useLinkComponent,
} from '@burojs/ui-shadcn';
import type * as React from 'react';
import { IDENTITY_RELATIONSHIP_RESOURCE } from '../../data/resource-names';
import { IDENTITY_RELATION_ENUM } from '../../enums/identity-governance';
import { PhotoThumb } from '../../fields/photo-thumb';
import type { identityRelationshipsBlock } from './identity-relationships-block';
import { identityRelationships, relatedFrom } from './identity-relationships-query';

/** The identity's relationships (`itap:identity-relationships`). */
export function IdentityRelationshipsView({
  props,
  t,
}: BlockViewProps<typeof identityRelationshipsBlock>): React.ReactElement {
  const identityId = props.identityId ?? null;
  const Link = useLinkComponent();
  const quick = useQuick();
  const query = useCustomQuery(identityRelationships, { identityId: identityId ?? '' }, {
    enabled: identityId !== null,
  });
  if (query.data === undefined) return <p className="text-sm text-muted-foreground">{t('loading')}</p>;
  const related = relatedFrom(query.data, identityId ?? '');
  if (related.length === 0) {
    return (
      <p data-testid="identity-relationships" className="text-sm text-muted-foreground">
        {t('none')}
      </p>
    );
  }
  return (
    <div data-testid="identity-relationships" className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('identity')}</TableHead>
            <TableHead>{t('relation')}</TableHead>
            <TableHead>{t('confidence')}</TableHead>
            <TableHead>{t('note')}</TableHead>
            <TableHead>
              <span className="sr-only">{t('open')}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {related.map((row) => (
            <TableRow key={row.id} data-testid="identity-relationship">
              <TableCell>
                <span className="flex items-center gap-2">
                  {row.other.primary_photo_file_id === null ? null : (
                    <PhotoThumb fileId={row.other.primary_photo_file_id} alt={row.other.code} className="size-10" />
                  )}
                  <Link href={`/identities/${row.other.id}`} className="text-primary underline-offset-4 hover:underline">
                    {row.other.code}
                  </Link>
                </span>
              </TableCell>
              <TableCell>
                <EnumBadge enumName={IDENTITY_RELATION_ENUM} value={row.relation} />
              </TableCell>
              <TableCell>{row.confidence === null ? '—' : row.confidence.toFixed(2)}</TableCell>
              <TableCell className="max-w-xs whitespace-normal">{row.note ?? '—'}</TableCell>
              <TableCell className="text-right">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t('openLabel', { params: { code: row.other.code } })}
                  onClick={() => quick.show(IDENTITY_RELATIONSHIP_RESOURCE, row.id)}
                >
                  {t('open')}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
