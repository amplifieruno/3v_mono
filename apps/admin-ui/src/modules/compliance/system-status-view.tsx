import { type BlockViewProps, useCustomQuery } from '@burojs/react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@burojs/ui-shadcn';
import type * as React from 'react';
import type { systemStatusBlock } from './system-status-block';
import type { SystemStatus } from './system-status-format';
import { type T, timeOf } from './system-status-labels';
import { CronsTable, LevelBadge, ServicesTable } from './system-status-parts';
import { systemStatusQuery } from './system-status-query';
import { DatabaseFacts, LastRetention, QueueDepths } from './system-status-side';

type Props = BlockViewProps<typeof systemStatusBlock>;

function Section(props: { readonly title: string; readonly scope: string; readonly children: React.ReactNode; readonly testId: string }): React.ReactElement {
  return (
    <Card data-testid={props.testId}>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
        <CardDescription>{props.scope}</CardDescription>
      </CardHeader>
      <CardContent>{props.children}</CardContent>
    </Card>
  );
}

function StatusBody({ status, t }: { readonly status: SystemStatus; readonly t: T }): React.ReactElement {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
        <span className="font-medium">{t('overall')}</span>
        <LevelBadge level={status.status} t={t} testId="system-status:overall" />
        <span className="text-muted-foreground">{t('checkedAt', { params: { time: timeOf(status.generated_at, '—') } })}</span>
      </div>
      <Section title={t('services')} scope={t('platform')} testId="system-status:services-card">
        <ServicesTable checks={status.checks} t={t} />
      </Section>
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title={t('database')} scope={t('platform')} testId="system-status:database-card">
          <DatabaseFacts postgres={status.postgres} t={t} />
        </Section>
        <Section title={t('queues')} scope={t('organization')} testId="system-status:queues-card">
          <QueueDepths queues={status.queues} t={t} />
        </Section>
        <Section title={t('retention')} scope={t('organization')} testId="system-status:retention-card">
          <LastRetention retention={status.retention} t={t} />
        </Section>
      </div>
      <Section title={t('crons')} scope={t('platform')} testId="system-status:crons-card">
        <CronsTable crons={status.crons} t={t} />
      </Section>
    </>
  );
}

/**
 * System status: reads `get_system_status` on opening and on "Check again"; renders every section
 * the answer holds, a failed probe as down with its error (Review Focus 5). Only reads.
 */
export function SystemStatusView({ t }: Props): React.ReactElement {
  // The probes take up to 3 s each: check on opening and on demand, not on every return to the tab.
  const status = useCustomQuery(systemStatusQuery, {}, { refetchOnWindowFocus: false });
  let body: React.ReactNode;
  if (status.isError || status.data === null) body = <p className="text-sm text-destructive" role="alert">{t('failed')}</p>;
  else if (status.data === undefined) body = <p className="text-sm text-muted-foreground">{t('checking')}</p>;
  else body = <StatusBody status={status.data} t={t} />;
  return (
    <section className="flex flex-col gap-4" data-testid="system-status" aria-label={t('label')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">{t('intro')}</p>
        <Button type="button" variant="outline" disabled={status.isFetching} onClick={() => void status.refetch()}>
          {status.isFetching ? t('checking') : t('refresh')}
        </Button>
      </div>
      {body}
    </section>
  );
}
