import type { BlockViewProps } from '@burojs/react';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@burojs/ui-shadcn';
import type * as React from 'react';
import type { auditDiffBlock } from './audit-diff-block';
import { type AuditDiffRow, type AuditValue, auditDiff, fieldWords } from './audit-diff-format';

type Props = BlockViewProps<typeof auditDiffBlock>;
type T = Props['t'];

/** One value: muted "empty", a "Redacted" badge, a line of text or indented JSON. */
function ValueCell({ value, t }: { readonly value: AuditValue | undefined; readonly t: T }): React.ReactElement {
  if (value === undefined || value.kind === 'empty') return <span className="text-muted-foreground italic">{t('empty')}</span>;
  if (value.kind === 'redacted') {
    return (
      <Badge variant="secondary" title={t('redactedHint')} data-testid="audit-diff:redacted">
        {t('redacted')}
      </Badge>
    );
  }
  if (value.kind === 'json') return <pre className="max-h-64 overflow-auto rounded bg-muted p-2 font-mono text-xs whitespace-pre-wrap">{value.text}</pre>;
  return <span className="break-words whitespace-pre-wrap">{value.text}</span>;
}

/** A field's words with its column (or JSON path) under it. */
function FieldCell({ field }: { readonly field: string }): React.ReactElement {
  return (
    <div className="flex flex-col">
      <span className="font-medium">{fieldWords(field)}</span>
      <span className="font-mono text-xs text-muted-foreground">{field}</span>
    </div>
  );
}

function DiffTable({ rows, twoSided, t }: { readonly rows: readonly AuditDiffRow[]; readonly twoSided: boolean; readonly t: T }): React.ReactElement {
  return (
    <div className="overflow-x-auto">
      <Table data-testid="audit-diff:table">
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/4">{t('field')}</TableHead>
            {twoSided ? <TableHead>{t('before')}</TableHead> : null}
            <TableHead>{twoSided ? t('after') : t('value')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.field} data-testid={`audit-diff:row:${row.field}`}>
              <TableCell className="align-top">
                <FieldCell field={row.field} />
              </TableCell>
              {twoSided ? (
                <TableCell className="align-top" data-testid="audit-diff:before">
                  <ValueCell value={row.before} t={t} />
                </TableCell>
              ) : null}
              <TableCell className="align-top" data-testid="audit-diff:after">
                {/* One side only: a removed row's values are its `before`, everything else's its `after`. */}
                <ValueCell value={twoSided ? row.after : (row.after ?? row.before)} t={t} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** The entry's `changes` read by its action (`./audit-diff-format.ts`). */
export function AuditDiffView({ props, t }: Props): React.ReactElement {
  const diff = auditDiff(props.auditAction, props.changes);
  let body: React.ReactNode;
  if (diff.kind === 'none') body = <p className="text-sm text-muted-foreground">{t('none')}</p>;
  else if (diff.kind === 'retention') body = <p className="text-sm">{t('retention')}</p>;
  else if (diff.kind === 'anonymized') body = <p className="text-sm">{t('anonymized')}</p>;
  else if (diff.kind === 'changes') {
    body = (
      <>
        <p className="text-sm text-muted-foreground">{t('changes', { params: { count: diff.rows.length } })}</p>
        <DiffTable rows={diff.rows} twoSided t={t} />
      </>
    );
  } else {
    body = (
      <>
        <p className="text-sm text-muted-foreground">{t(diff.kind)}</p>
        <DiffTable rows={diff.rows} twoSided={false} t={t} />
      </>
    );
  }
  return (
    <section className="flex flex-col gap-2" data-testid="audit-diff" data-kind={diff.kind} aria-label={t('label')}>
      {body}
    </section>
  );
}
