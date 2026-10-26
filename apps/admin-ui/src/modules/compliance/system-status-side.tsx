import { EnumBadge } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { RETENTION_RUN_RESOURCE } from '../../data/resource-names';
import { RETENTION_RUN_STATUS_ENUM } from '../../enums/compliance';
import { RecordLink } from '../access/record-link';
import { type SystemStatus, formatBytes } from './system-status-format';
import { type T, nameOf, timeOf } from './system-status-labels';

/** Connections, size and the largest tables (platform-wide). */
export function DatabaseFacts({ postgres, t }: { readonly postgres: SystemStatus['postgres']; readonly t: T }): React.ReactElement {
  const { connections, max_connections: max } = postgres;
  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="system-status:database">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">{t('connections')}</dt>
        <dd>{connections === null ? '—' : max === null ? connections : t('connectionsValue', { params: { used: connections, max } })}</dd>
        <dt className="text-muted-foreground">{t('dbSize')}</dt>
        <dd data-testid="system-status:db-size">{formatBytes(postgres.db_size_bytes)}</dd>
      </dl>
      {postgres.largest_tables.length > 0 ? (
        <>
          <p className="font-medium">{t('largestTables')}</p>
          <ul className="flex flex-col gap-0.5">
            {postgres.largest_tables.map((row) => (
              <li key={row.table} className="flex justify-between gap-4">
                <span className="font-mono text-xs break-all">{row.table}</span>
                <span className="text-muted-foreground whitespace-nowrap">{formatBytes(row.total_bytes)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

/** This organization's pending work per queue. */
export function QueueDepths({ queues, t }: { readonly queues: SystemStatus['queues']; readonly t: T }): React.ReactElement {
  return (
    <ul className="flex flex-col gap-1 text-sm" data-testid="system-status:queues">
      {queues.map((queue) => (
        <li key={queue.key} className="flex justify-between gap-4" data-testid={`system-status:queue:${queue.key}`}>
          <span>{nameOf(t, 'queue', queue.key)}</span>
          <span className={queue.count > 0 ? 'font-medium' : 'text-muted-foreground'}>{queue.count}</span>
        </li>
      ))}
    </ul>
  );
}

/** This organization's last (non-dry) retention run, linked to its page. */
export function LastRetention({ retention, t }: { readonly retention: SystemStatus['retention']; readonly t: T }): React.ReactElement {
  if (retention === null) return <p className="text-sm text-muted-foreground">{t('retentionNone')}</p>;
  const when =
    retention.finished_at !== null
      ? t('retentionFinished', { params: { time: timeOf(retention.finished_at, '—') } })
      : t('retentionStarted', { params: { time: timeOf(retention.started_at ?? retention.scheduled_at, '—') } });
  return (
    <div className="flex flex-col gap-1 text-sm" data-testid="system-status:retention">
      <div className="flex flex-wrap items-center gap-2">
        <EnumBadge enumName={RETENTION_RUN_STATUS_ENUM} value={retention.status} />
        <span>{when}</span>
      </div>
      {retention.error === null ? null : <p className="text-destructive break-words">{retention.error}</p>}
      <RecordLink resource={RETENTION_RUN_RESOURCE} id={retention.run_id} name={t('retentionOpen')} fallback="" />
    </div>
  );
}
