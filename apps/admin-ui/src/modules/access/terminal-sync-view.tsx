import { type BlockViewProps, useCustomQuery } from '@burojs/react';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { DEVICE_RESOURCE } from '../../data/resource-names';
import { formatDateTime } from '../../fields/date-time-format';
import { RecordLink } from './record-link';
import type { terminalSyncBlock } from './terminal-sync-block';
import { STATE_VARIANT, countStates, terminalState, terminalsOf } from './terminal-sync-format';
import { type TerminalStatus, terminalSyncStatus } from './terminal-ops';

type Props = BlockViewProps<typeof terminalSyncBlock>;
type T = Props['t'];

/** How often the block reads again: quickly while an override is in view, else every half minute. */
export const OVERRIDE_POLL_MS = 5_000;
export const STATUS_POLL_MS = 30_000;

const when = (value: string | null, t: T): string => {
  const at = value === null ? Number.NaN : Date.parse(value);
  return Number.isNaN(at) ? t('never') : formatDateTime(at);
};

function Note({ row, t }: { readonly row: TerminalStatus; readonly t: T }): React.ReactElement | null {
  const notes: string[] = [];
  if (row.sync_error !== null) notes.push(row.sync_error);
  if (row.urgent_pending && row.seconds_since_urgent !== null) {
    notes.push(t('urgentPending', { params: { seconds: Math.round(row.seconds_since_urgent), bound: row.bound_seconds } }));
  }
  if (!row.within_bound) notes.push(t('outsideBound'));
  return notes.length === 0 ? null : <span className="text-muted-foreground">{notes.join(' · ')}</span>;
}

function Summary({ rows, since, ended, t }: { readonly rows: readonly TerminalStatus[]; readonly since: string | null; readonly ended: boolean; readonly t: T }) {
  const counts = countStates(rows, since);
  const total = rows.length;
  const text =
    since === null
      ? t('summaryOverview', { params: { current: counts.current, total, epoch: rows[0]?.epoch ?? 0 } })
      : t(ended ? 'summaryEnded' : 'summaryStarted', { params: { received: counts.received, total } });
  return (
    <div className="flex flex-col gap-1 text-sm" data-testid="terminal-sync-summary">
      <p>{text}</p>
      {counts.unreachable > 0 ? <p className="text-muted-foreground">{t('unreachableNote', { params: { count: counts.unreachable } })}</p> : null}
    </div>
  );
}

/**
 * The terminals' sync state (`itap:terminal-sync-status`): a summary line, then one row per
 * terminal with its state, the epoch it holds, its last sync and any error or pending change.
 */
export function TerminalSyncView({ props, t }: Props): React.ReactElement {
  const startedAt = props.startedAt ?? null;
  const endedAt = props.endedAt ?? null;
  const since = endedAt ?? startedAt;
  const status = useCustomQuery(terminalSyncStatus, {}, { refetchInterval: since === null ? STATUS_POLL_MS : OVERRIDE_POLL_MS });
  const deviceId = props.deviceId ?? null;
  const rows = terminalsOf(status.data ?? [], props.facilityId ?? null, deviceId);

  let body: React.ReactNode;
  if (status.isError) body = <p className="text-sm text-destructive">{t('failed')}</p>;
  else if (status.data === undefined) body = <p className="text-sm text-muted-foreground">{t('loading')}</p>;
  else if (rows.length === 0) body = <p className="text-sm text-muted-foreground">{t(deviceId === null ? 'none' : 'noDevice')}</p>;
  else {
    body = (
      <>
        <Summary rows={rows} since={since} ended={endedAt !== null} t={t} />
        <div className="overflow-x-auto rounded-md border">
          <Table data-testid="terminal-sync-table">
            <TableHeader>
              <TableRow>
                <TableHead>{t('colTerminal')}</TableHead>
                <TableHead>{t('colState')}</TableHead>
                <TableHead>{t('colEpoch')}</TableHead>
                <TableHead>{t('colSynced')}</TableHead>
                <TableHead>{t('colNote')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const state = terminalState(row, since);
                return (
                  <TableRow key={row.device_id} data-testid="terminal-sync-row" data-state={state}>
                    <TableCell>
                      <RecordLink resource={DEVICE_RESOURCE} id={row.device_id} name={row.device_name} fallback={row.device_name} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATE_VARIANT[state]}>{t(`state_${state}`)}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.synced_epoch === null ? t('never') : t('epochOf', { params: { held: row.synced_epoch, epoch: row.epoch } })}
                    </TableCell>
                    <TableCell>{when(row.synced_at, t)}</TableCell>
                    <TableCell>
                      <Note row={row} t={t} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </>
    );
  }
  return (
    <section className="flex flex-col gap-3" data-testid="terminal-sync" aria-label={t('label')}>
      {body}
    </section>
  );
}
