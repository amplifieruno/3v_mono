import { type BlockViewProps, useCustomQuery } from '@burojs/react';
import { EnumBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { DEVICE_RESOURCE } from '../../data/resource-names';
import { TERMINAL_SYNC_RESULTS, TERMINAL_SYNC_RESULT_ENUM } from '../../enums/access';
import type { publishResultBlock } from './publish-result-block';
import { RecordLink } from './record-link';
import { terminalSyncStatus } from './terminal-ops';

type Props = BlockViewProps<typeof publishResultBlock>;

const RECORDED: ReadonlySet<string> = new Set(TERMINAL_SYNC_RESULTS);

/**
 * The answer of "Publish policy to terminals" (`itap:terminal-publish-result`): a summary, then
 * each terminal by name with its result and epoch; before the push, what publishing does.
 */
export function PublishResultView({ props, t }: Props): React.ReactElement {
  const terminals = props.terminals ?? null;
  const names = useCustomQuery(terminalSyncStatus, {}, { enabled: terminals !== null && terminals.length > 0 });
  const nameOf = new Map((names.data ?? []).map((row) => [row.device_id, row.device_name]));

  let body: React.ReactNode;
  if (terminals === null) body = <p className="text-sm text-muted-foreground">{t('intro')}</p>;
  else if (terminals.length === 0) body = <p className="text-sm">{t('nothing')}</p>;
  else {
    const synced = terminals.filter((row) => row.result === 'synced').length;
    const epoch = Math.max(...terminals.map((row) => row.epoch));
    body = (
      <>
        <p className="text-sm" data-testid="publish-summary">
          {t('summary', { params: { epoch, synced, total: terminals.length } })}
        </p>
        <div className="overflow-x-auto rounded-md border">
          <Table data-testid="publish-table">
            <TableHeader>
              <TableRow>
                <TableHead>{t('colTerminal')}</TableHead>
                <TableHead>{t('colResult')}</TableHead>
                <TableHead>{t('colEpoch')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {terminals.map((row) => (
                <TableRow key={row.device_id} data-testid="publish-row" data-result={row.result}>
                  <TableCell>
                    <RecordLink resource={DEVICE_RESOURCE} id={row.device_id} name={nameOf.get(row.device_id)} fallback={t('unnamed')} />
                  </TableCell>
                  <TableCell>
                    {RECORDED.has(row.result) ? (
                      <EnumBadge enumName={TERMINAL_SYNC_RESULT_ENUM} value={row.result} />
                    ) : (
                      <span className="text-muted-foreground">{t('skipped')}</span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">{row.epoch}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </>
    );
  }
  return (
    <section className="flex flex-col gap-3" data-testid="publish-result" aria-label={t('label')}>
      {body}
    </section>
  );
}
