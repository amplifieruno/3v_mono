import { defineCustomPage, facts } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { deliveryReportBlock } from '../../blocks/delivery-report/delivery-report-block';
import { REPORT_FACT_ROWS, type ReportPeriod, deliveryReportFacts } from '../../blocks/delivery-report/delivery-report-query';

/** The periods as the page's tabs, the default (last 7 days) first. */
const PERIOD_TABS: readonly { readonly period: ReportPeriod; readonly title: string }[] = [
  { period: '7d', title: 'Last 7 days' },
  { period: '24h', title: 'Last 24 hours' },
  { period: '30d', title: 'Last 30 days' },
];

/**
 * "Delivery report": how notifications fared over a period (`delivery_report`), chosen as a tab
 * (kept in the URL): the headline figures over every channel (facts block) and the table per
 * channel. A period's figures are read when its tab opens, up to that moment.
 */
export const deliveryReportPage = defineCustomPage({
  name: 'delivery-report',
  icon: NAV_ICONS.deliveryReport,
  path: '/delivery-report',
  texts: 'Delivery report',
  section: NAV_SECTIONS.notifications,
  order: 80,
  body: (l) => [
    l.tabs(
      PERIOD_TABS.map(({ period, title }) =>
        l.panel(
          [
            l.place(facts, {
              key: `facts-${period}`,
              props: { query: deliveryReportFacts, input: { period }, rows: [...REPORT_FACT_ROWS], view: 'grid' },
            }),
            l.place(deliveryReportBlock, { key: `channels-${period}`, props: { period } }),
          ],
          { key: `last-${period}`, texts: title },
        ),
      ),
      { key: 'period' },
    ),
  ],
});
