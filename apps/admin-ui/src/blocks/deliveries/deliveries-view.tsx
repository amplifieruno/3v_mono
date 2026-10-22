import { type BlockViewProps, useCustomQuery } from '@burojs/react';
import { EnumBadge, cn } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { NOTIFICATION_CHANNEL_ENUM } from '../../enums/notifications';
import { BlockNote } from '../charts/block-note';
import { StackedBar } from '../charts/stacked-bar';
import { deliveryReport } from '../delivery-report/delivery-report-query';
import type { deliveriesBlock } from './deliveries-block';
import { DELIVERY_OUTCOMES, activeChannels, outcomeParts } from './deliveries-shape';

const TEST_ID = 'deliveries';

/**
 * The deliveries block's view (`itap:deliveries`): the headline figures of the period (one read of
 * `delivery_report`, shared with the Delivery report page's), then one bar per channel.
 */
export function DeliveriesView({ props, t }: BlockViewProps<typeof deliveriesBlock>): React.ReactElement {
  const report = useCustomQuery(deliveryReport, { period: props.period });
  if (report.isError) return <BlockNote testId={TEST_ID} tone="error">{t('failed')}</BlockNote>;
  if (report.data === undefined) return <BlockNote testId={TEST_ID}>{t('loading')}</BlockNote>;
  const { channels, scale } = activeChannels(report.data.channels);
  if (channels.length === 0) return <BlockNote testId={TEST_ID}>{t('none')}</BlockNote>;
  const figures = [
    ['total', report.data.total],
    ['delivered', report.data.delivered],
    ['problems', report.data.failed + report.data.dead_letter],
    ['ackRate', report.data.ack_rate ?? '—'],
  ] as const;
  const labelOf = (outcome: string) => t(`outcome_${outcome}`);
  return (
    <section data-testid={TEST_ID} className="flex flex-col gap-3" aria-label={t('label')}>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {figures.map(([key, value]) => (
          <div key={key} className="flex flex-col gap-0.5" data-testid={`${TEST_ID}:${key}`}>
            <dt className="text-xs text-muted-foreground">{t(key)}</dt>
            <dd className="text-xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <ul className="flex flex-col gap-2">
        {channels.map((row) => (
          <li key={row.channel} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-2 text-sm">
            <EnumBadge enumName={NOTIFICATION_CHANNEL_ENUM} value={row.channel} presentation="plain" />
            <StackedBar
              testId={`${TEST_ID}:${row.channel}`}
              parts={outcomeParts(row, labelOf)}
              total={scale}
              ariaLabel={t('channelChart', { params: { channel: row.channel } })}
            />
            <span className="text-right tabular-nums">{row.total}</span>
          </li>
        ))}
      </ul>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-hidden>
        {DELIVERY_OUTCOMES.map((outcome) => (
          <li key={outcome.key} className="flex items-center gap-1">
            <span className={cn('inline-block size-2 rounded-sm', outcome.swatch)} />
            {labelOf(outcome.key)}
          </li>
        ))}
      </ul>
    </section>
  );
}
