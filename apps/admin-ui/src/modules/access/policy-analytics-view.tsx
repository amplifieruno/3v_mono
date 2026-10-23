import { type BlockViewProps, useCustomQuery } from '@burojs/react';
import type * as React from 'react';
import { AnalyticsDenials } from './analytics-denials';
import { AnalyticsRuleSet } from './analytics-rule-set';
import { AnalyticsVersions } from './analytics-versions';
import type { policyAnalyticsBlock } from './policy-analytics-block';
import { policyAnalyticsQuery } from './policy-analytics-query';

type Props = BlockViewProps<typeof policyAnalyticsBlock>;

/**
 * The policy analytics of a period (`itap:policy-analytics`): decisions per version and the unused
 * versions in force, denial reasons and the most denied pairs, then overlaps, grants and the
 * size of the rule set; one read of `policy_analytics`, shared with the page's facts block.
 */
export function PolicyAnalyticsView({ props, t }: Props): React.ReactElement {
  const analytics = useCustomQuery(policyAnalyticsQuery, { period: props.period });
  if (analytics.isError) return <p className="text-sm text-destructive">{t('failed')}</p>;
  if (analytics.data === undefined) return <p className="text-sm text-muted-foreground">{t('loading')}</p>;
  const row = analytics.data.detail;
  return (
    <section className="flex flex-col gap-6" data-testid="policy-analytics" aria-label={t('label')}>
      <AnalyticsVersions row={row} t={t} />
      <AnalyticsDenials row={row} t={t} />
      <AnalyticsRuleSet row={row} t={t} />
      <p className="text-xs text-muted-foreground">{t('read', { params: { time: new Date(analytics.dataUpdatedAt).toLocaleTimeString() } })}</p>
    </section>
  );
}
