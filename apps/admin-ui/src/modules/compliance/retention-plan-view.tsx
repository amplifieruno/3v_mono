import { type BlockViewProps, useCustomQuery } from '@burojs/react';
import { Button, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@burojs/ui-shadcn';
import * as React from 'react';
import type { retentionPlanBlock } from './retention-plan-block';
import { PLAN_HORIZONS, type PlanHorizon, planTotals, retentionPlanQuery } from './retention-plan-query';
import { RetentionPlanTable } from './retention-plan-table';

type Props = BlockViewProps<typeof retentionPlanBlock>;

/**
 * The retention plan (`itap:retention-plan`): reads `retention_plan` as soon as it opens (as of
 * now), again for another moment or on "Count again". A summary of the totals, then the rows.
 * Only reads: the query writes nothing.
 */
export function RetentionPlanView({ t }: Props): React.ReactElement {
  const [days, setDays] = React.useState<PlanHorizon>(0);
  const plan = useCustomQuery(retentionPlanQuery, { days });

  let body: React.ReactNode;
  if (plan.isError) body = <p className="text-sm text-destructive">{t('failed')}</p>;
  else if (plan.data === undefined) body = <p className="text-sm text-muted-foreground">{t('running')}</p>;
  else if (plan.data.rows.length === 0) body = <p className="text-sm text-muted-foreground">{t('none')}</p>;
  else {
    const totals = planTotals(plan.data.rows);
    body = (
      <>
        <p className="text-sm font-medium" data-testid="retention-plan-summary" aria-live="polite">
          {totals.candidates === 0 && totals.held === 0 ? t('nothing') : t('summary', { params: totals })}
        </p>
        <RetentionPlanTable plan={plan.data} t={t} />
        <p className="text-xs text-muted-foreground">{t('counted', { params: { time: new Date(plan.dataUpdatedAt).toLocaleTimeString() } })}</p>
      </>
    );
  }

  return (
    <section className="flex flex-col gap-4" data-testid="retention-plan" aria-label={t('label')}>
      <p className="text-sm text-muted-foreground">{t('intro')}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="retention-plan-horizon">{t('horizon')}</Label>
          <Select value={String(days)} onValueChange={(next) => setDays(Number(next) as PlanHorizon)}>
            <SelectTrigger id="retention-plan-horizon" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLAN_HORIZONS.map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {t(`horizon_${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" disabled={plan.isFetching} onClick={() => void plan.refetch()}>
          {plan.isFetching ? t('running') : t('run')}
        </Button>
      </div>
      {body}
    </section>
  );
}
