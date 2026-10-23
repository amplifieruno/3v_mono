import { type BlockViewProps, useCustomQuery } from '@burojs/react';
import { Button, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@burojs/ui-shadcn';
import * as React from 'react';
import { accessNamesQuery, idsOf } from './access-names-query';
import type { simulationBlock } from './simulation-block';
import {
  SAMPLE_LIMITS,
  SIMULATION_PERIODS,
  type Simulation,
  type SimulationPeriod,
  simulateAccessPolicy,
  simulationRefusal,
} from './simulation-query';
import { SimulationTable } from './simulation-table';

type Props = BlockViewProps<typeof simulationBlock>;
type T = Props['t'];

const EMPTY_NAMES = { profiles: {}, accessPoints: {}, identities: {} };

/** The notes under the summary: sampling, skipped and drifted decisions, a cut list. */
function Notes({ result, t }: { readonly result: Simulation; readonly t: T }): React.ReactElement {
  const changed = result.granted_to_denied + result.denied_to_granted + result.reason_changed;
  return (
    <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
      {result.sampled ? <li>{t('sampled')}</li> : null}
      {result.skipped > 0 ? <li>{t('skipped', { params: { count: result.skipped } })}</li> : null}
      {result.drifted > 0 ? <li>{t('drifted', { params: { count: result.drifted } })}</li> : null}
      {changed > result.samples.length ? <li>{t('more', { params: { shown: result.samples.length } })}</li> : null}
    </ul>
  );
}

/**
 * The simulation of a policy version (`itap:access-policy-simulation`): runs as soon as it opens
 * over the last 7 days (24 hours or 30 days on request), and again on "Simulate again". A summary
 * of the changes, notes, then the changed decisions with names.
 */
export function SimulationView({ props, t }: Props): React.ReactElement {
  const versionId = props.versionId ?? null;
  const [period, setPeriod] = React.useState<SimulationPeriod>('7d');
  const [limit, setLimit] = React.useState<number>(SAMPLE_LIMITS[0]);
  const run = useCustomQuery(simulateAccessPolicy, { versionId: versionId ?? '', period, limit }, { enabled: versionId !== null });
  const samples = run.data?.samples ?? [];
  const namesInput = {
    profileIds: idsOf(samples, (s) => s.profile_id),
    accessPointIds: idsOf(samples, (s) => s.access_point_id),
    identityIds: idsOf(samples, (s) => (s.profile_id === null ? s.identity_id : null)),
  };
  const names = useCustomQuery(accessNamesQuery, namesInput, { enabled: samples.length > 0 });

  let body: React.ReactNode;
  if (run.isError) {
    const refusal = simulationRefusal(run.error);
    body = <p className="text-sm text-destructive">{t(refusal === 'gone' ? 'gone' : refusal === 'period' ? 'periodInvalid' : 'failed')}</p>;
  } else if (run.data === undefined) body = <p className="text-sm text-muted-foreground">{t('running')}</p>;
  else if (run.data === null) body = <p className="text-sm text-destructive">{t('gone')}</p>;
  else if (run.data.decisions_in_period === 0) body = <p className="text-sm text-muted-foreground">{t('none')}</p>;
  else {
    const result = run.data;
    const changed = result.granted_to_denied + result.denied_to_granted + result.reason_changed;
    body = (
      <>
        <p className="text-sm font-medium" data-testid="simulation-summary" aria-live="polite">
          {changed === 0
            ? t('unchanged')
            : t('summary', {
                params: {
                  evaluated: result.evaluated,
                  total: result.decisions_in_period,
                  toDenied: result.granted_to_denied,
                  toGranted: result.denied_to_granted,
                  reasons: result.reason_changed,
                },
              })}
        </p>
        <Notes result={result} t={t} />
        {samples.length > 0 ? <SimulationTable samples={samples} names={names.data ?? EMPTY_NAMES} t={t} /> : null}
        <p className="text-xs text-muted-foreground">{t('simulated', { params: { time: new Date(run.dataUpdatedAt).toLocaleTimeString() } })}</p>
      </>
    );
  }

  return (
    <section className="flex flex-col gap-4" data-testid="policy-simulation" aria-label={t('label')}>
      <p className="text-sm text-muted-foreground">{t('intro')}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="simulation-period">{t('period')}</Label>
          <Select value={period} onValueChange={(next) => setPeriod(next as SimulationPeriod)}>
            <SelectTrigger id="simulation-period" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIMULATION_PERIODS.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`period_${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="simulation-limit">{t('limit')}</Label>
          <Select value={String(limit)} onValueChange={(next) => setLimit(Number(next))}>
            <SelectTrigger id="simulation-limit" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SAMPLE_LIMITS.map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" disabled={versionId === null || run.isFetching} onClick={() => void run.refetch()}>
          {run.isFetching ? t('running') : t('run')}
        </Button>
      </div>
      {body}
    </section>
  );
}
