import { defineCustomPage, facts } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { policyAnalyticsBlock } from './policy-analytics-block';
import { ANALYTICS_FACT_ROWS, type AnalyticsPeriod, policyAnalyticsQuery } from './policy-analytics-query';

/** The periods as the page's tabs, the default (last 30 days) first. */
const PERIOD_TABS: readonly { readonly period: AnalyticsPeriod; readonly title: string }[] = [
  { period: '30d', title: 'Last 30 days' },
  { period: '7d', title: 'Last 7 days' },
  { period: '90d', title: 'Last 90 days' },
];

/**
 * "Policy analytics": how the access policies worked over a period (`policy_analytics`), chosen as
 * a tab (kept in the URL): the headline figures (facts block) and the detail, both from one read
 * of the period made when its tab opens.
 */
export const policyAnalyticsPage = defineCustomPage({
  name: 'policy-analytics',
  icon: NAV_ICONS.policyAnalytics,
  path: '/policy-analytics',
  texts: 'Policy analytics',
  section: NAV_SECTIONS.access,
  order: 30,
  body: (l) => [
    l.tabs(
      PERIOD_TABS.map(({ period, title }) =>
        l.panel(
          [
            l.place(facts, {
              key: `facts-${period}`,
              props: { query: policyAnalyticsQuery, input: { period }, rows: [...ANALYTICS_FACT_ROWS], view: 'grid' },
            }),
            l.place(policyAnalyticsBlock, { key: `detail-${period}`, props: { period } }),
          ],
          { key: `last-${period}`, texts: title },
        ),
      ),
      { key: 'period' },
    ),
  ],
});
