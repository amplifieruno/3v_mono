import { type BlockViewProps, useCustomQuery } from '@burojs/react';
import { EnumBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, cn } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { NOTIFICATION_CHANNEL_ENUM } from '../../enums/notifications';
import type { deliveryReportBlock } from './delivery-report-block';
import { type ReportRow, deliveryReport, formatSeconds } from './delivery-report-query';

type Props = BlockViewProps<typeof deliveryReportBlock>;

/** The count columns of the table, in order, with their text keys. */
const COUNTS = [
  ['total', 'total'],
  ['pending', 'pending'],
  ['sent', 'sent'],
  ['delivered', 'delivered'],
  ['failed', 'failedCount'],
  ['dead_letter', 'dead_letter'],
  ['digested', 'digested'],
  ['acknowledged', 'acknowledged'],
  ['escalations', 'escalations'],
] as const satisfies readonly (readonly [keyof ReportRow, string])[];

const dash = '—';

/** A channel with nothing in the period is drawn muted. */
function isEmpty(row: ReportRow): boolean {
  return row.total === 0 && row.digested === 0;
}

/**
 * The delivery report's table (`itap:delivery-report`): one row per channel for the period, read
 * when the period's tab opens. Problem counts (failed, dead letters) stand out when not zero.
 */
export function DeliveryReportView({ props, t }: Props): React.ReactElement {
  const report = useCustomQuery(deliveryReport, { period: props.period });
  if (report.isError) return <p className="text-sm text-destructive">{t('failed')}</p>;
  if (report.data === undefined) return <p className="text-sm text-muted-foreground">{t('loading')}</p>;
  const rows = report.data;
  return (
    <section className="flex flex-col gap-2" data-testid="delivery-report" aria-label={t('label')}>
      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="delivery-report-table">
          <TableHeader>
            <TableRow>
              <TableHead>{t('channel')}</TableHead>
              {COUNTS.map(([column, key]) => (
                <TableHead key={column} className="text-right">
                  {t(key)}
                </TableHead>
              ))}
              <TableHead className="text-right">{t('ack_rate')}</TableHead>
              <TableHead className="text-right">{t('avg_response')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.channel} data-testid="delivery-report-row" data-channel={row.channel} className={cn(isEmpty(row) && 'text-muted-foreground')}>
                <TableCell>
                  <EnumBadge enumName={NOTIFICATION_CHANNEL_ENUM} value={row.channel} />
                </TableCell>
                {COUNTS.map(([column]) => (
                  <TableCell
                    key={column}
                    data-column={column}
                    className={cn(
                      'text-right tabular-nums',
                      column === 'total' && 'font-medium',
                      (column === 'failed' || column === 'dead_letter') && row[column] > 0 && 'font-medium text-destructive',
                    )}
                  >
                    {row[column]}
                  </TableCell>
                ))}
                <TableCell className="text-right tabular-nums">{row.ack_rate === null ? dash : `${Math.round(row.ack_rate * 100)}%`}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.avg_response_seconds === null ? dash : formatSeconds(row.avg_response_seconds)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">{t('note', { params: { time: new Date(report.dataUpdatedAt).toLocaleTimeString() } })}</p>
    </section>
  );
}
