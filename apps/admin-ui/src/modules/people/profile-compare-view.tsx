import { type BlockViewProps, useCustomQuery } from '@burojs/react';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, cn } from '@burojs/ui-shadcn';
import { TriangleAlert } from 'lucide-react';
import type * as React from 'react';
import type { profileCompareBlock } from './profile-compare-block';
import { compareRows } from './profile-compare-rows';
import { type PairProfile, profilePair } from './profile-pair';

type CompareProps = BlockViewProps<typeof profileCompareBlock>;

/** A warning line of the comparison. */
function Warning({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  return (
    <p role="alert" className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

/** The column heading of one profile: its code, and its part in the merge when a side is chosen. */
function Heading({
  profile,
  caption,
  role,
}: {
  readonly profile: PairProfile;
  readonly caption: string;
  readonly role: string | null;
}): React.ReactElement {
  return (
    <TableHead>
      <span className="flex flex-wrap items-center gap-2">
        {caption} · {profile.code}
        {role === null ? null : <Badge variant="outline">{role}</Badge>}
      </span>
    </TableHead>
  );
}

/** The duplicate comparison (`itap:profile-compare`). */
export function ProfileCompareView({ props, t }: CompareProps): React.ReactElement {
  const first = props.first ?? null;
  const second = props.second ?? null;
  const keep = props.keep ?? null;
  const pair = useCustomQuery(profilePair, { first: first ?? '', second: second ?? '' }, {
    enabled: first !== null && second !== null,
  });
  if (pair.data === undefined) return <p className="text-sm text-muted-foreground">{t('loading')}</p>;
  const a = pair.data.first;
  const b = pair.data.second;
  if (a === null || b === null) return <p className="text-sm text-destructive">{t('missing')}</p>;
  const keepSecond = keep === 'second';
  const role = (isSecond: boolean): string | null =>
    keep === null ? null : t(isSecond === keepSecond ? 'kept' : 'mergedAway');
  const [target, source] = keepSecond ? [b, a] : [a, b];
  return (
    <div className="flex flex-col gap-3" data-testid="profile-compare">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('field')}</TableHead>
              <Heading profile={a} caption={t('first')} role={role(false)} />
              <Heading profile={b} caption={t('second')} role={role(true)} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {compareRows(a, b).map((row) => (
              <TableRow key={row.field} data-differs={row.differs || undefined}>
                <TableCell className="text-muted-foreground">
                  {t(`field_${row.field}`)}
                  {row.differs ? <span className="sr-only"> ({t('differs')})</span> : null}
                </TableCell>
                {[row.first, row.second].map((value, index) => (
                  <TableCell key={index} className={cn(row.differs && 'bg-amber-50 font-medium dark:bg-amber-950/40')}>
                    {value ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {[a, b].map((p) =>
        p.erased_at !== null ? (
          <Warning key={`erased-${p.id}`}>{t('erased', { params: { code: p.code } })}</Warning>
        ) : p.processing_restricted ? (
          <Warning key={`restricted-${p.id}`}>{t('restricted', { params: { code: p.code } })}</Warning>
        ) : null,
      )}
      {keep === null ? null : (
        <p className="text-sm" data-testid="profile-compare-moves">
          {t('moves', {
            params: {
              source: source.code,
              target: target.code,
              identities: source.identities,
              documents: source.documents,
              consents: source.consents,
            },
          })}
        </p>
      )}
    </div>
  );
}
