import type { BlockViewProps } from '@burojs/react';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@burojs/ui-shadcn';
import type * as React from 'react';
import type { systemStatusBlock } from './system-status-block';
import type { CronStatus, StatusCheck, StatusLevel } from './system-status-format';
import { formatLag } from './system-status-format';
import { nameOf, timeOf } from './system-status-labels';

type T = BlockViewProps<typeof systemStatusBlock>['t'];

const VARIANTS = { ok: 'success', degraded: 'warning', down: 'destructive', unknown: 'secondary' } as const;

export function LevelBadge({ level, t, testId }: { readonly level: StatusLevel; readonly t: T; readonly testId?: string }): React.ReactElement {
  return (
    <Badge variant={VARIANTS[level]} data-testid={testId} data-level={level}>
      {t(`level_${level}`)}
    </Badge>
  );
}

/** What a probe adds: its error when down, the recognition model when it reports one. */
function checkDetails(check: StatusCheck, t: T): string {
  const { error, model } = check.details;
  if (typeof error === 'string' && error !== '') return error;
  if (typeof model === 'string' && model !== '') return t('model', { params: { model } });
  return '';
}

export function ServicesTable({ checks, t }: { readonly checks: readonly StatusCheck[]; readonly t: T }): React.ReactElement {
  return (
    <div className="overflow-x-auto">
      <Table data-testid="system-status:services">
        <TableHeader>
          <TableRow>
            <TableHead>{t('service')}</TableHead>
            <TableHead>{t('status')}</TableHead>
            <TableHead>{t('latency')}</TableHead>
            <TableHead>{t('details')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {checks.map((check) => (
            <TableRow key={check.name} data-testid={`system-status:check:${check.name}`}>
              <TableCell className="font-medium">{nameOf(t, 'check', check.name)}</TableCell>
              <TableCell>
                <LevelBadge level={check.status} t={t} />
              </TableCell>
              <TableCell>{check.latency_ms === null ? '—' : t('latencyValue', { params: { ms: check.latency_ms } })}</TableCell>
              <TableCell className={check.status === 'down' ? 'text-destructive break-words' : 'text-muted-foreground'}>{checkDetails(check, t)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function CronsTable({ crons, t }: { readonly crons: readonly CronStatus[]; readonly t: T }): React.ReactElement {
  if (crons.length === 0) return <p className="text-sm text-muted-foreground">{t('cronsNone')}</p>;
  return (
    <div className="overflow-x-auto">
      <Table data-testid="system-status:crons">
        <TableHeader>
          <TableRow>
            <TableHead>{t('job')}</TableHead>
            <TableHead>{t('status')}</TableHead>
            <TableHead>{t('lag')}</TableHead>
            <TableHead>{t('lastRun')}</TableHead>
            <TableHead>{t('errors')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {crons.map((cron) => (
            <TableRow key={cron.name} data-testid={`system-status:cron:${cron.name}`}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium">{nameOf(t, 'cron', cron.name)}</span>
                  <span className="font-mono text-xs text-muted-foreground">{cron.name}</span>
                </div>
              </TableCell>
              <TableCell>
                <LevelBadge level={cron.status} t={t} />
              </TableCell>
              <TableCell data-testid="system-status:lag">{formatLag(cron.lag_seconds)}</TableCell>
              <TableCell>{timeOf(cron.last_delivered_at, t('never'))}</TableCell>
              <TableCell className={cron.errors_24h > 0 ? 'text-destructive' : undefined}>{cron.errors_24h}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
