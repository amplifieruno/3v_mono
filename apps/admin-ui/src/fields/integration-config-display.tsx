import { type ScalarDisplayProps, useT } from '@burojs/react';
import type * as React from 'react';
import { cronSummary } from './cron-format';
import { useCronPhrase } from './cron-phrase';
import type { IntegrationJsonKind } from './integration-config';

/** Keys of `config` drawn as the schedule line rather than as settings. */
const SCHEDULE_KEYS: ReadonlySet<string> = new Set(['schedule_cron', 'schedule_timezone']);

const shown = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value));

/**
 * An integration's settings in words: the schedule as a sentence with its zone (or "No schedule"),
 * then every other setting as name and value; or its field mapping as source field → profile column.
 * A value that is no object (a refused save cannot store one) is shown as JSON.
 */
export function IntegrationConfigDisplay(props: ScalarDisplayProps<unknown, { kind: IntegrationJsonKind }>): React.ReactElement {
  const t = useT();
  const phrase = useCronPhrase();
  const { value, testIds, meta, i18n } = props;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return <span className="text-muted-foreground" data-testid={testIds.display}>{value === null || value === undefined ? '—' : shown(value)}</span>;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (meta?.kind === 'mapping') {
    if (entries.length === 0) return <span className="text-muted-foreground" data-testid={testIds.display}>{t('console.integrationConfig.noMapping')}</span>;
    return (
      <ul className="flex flex-col gap-0.5 text-sm" data-testid={testIds.display}>
        {entries.map(([source, column]) => (
          <li key={source}>
            <code className="font-mono">{source}</code> → <code className="font-mono">{shown(column)}</code>
          </li>
        ))}
      </ul>
    );
  }
  const config = value as Record<string, unknown>;
  const cron = config.schedule_cron;
  const summary = typeof cron === 'string' ? cronSummary(cron, phrase, i18n.locale) : null;
  const zone = typeof config.schedule_timezone === 'string' ? config.schedule_timezone : 'UTC';
  const settings = entries.filter(([key]) => !SCHEDULE_KEYS.has(key));
  return (
    <div className="flex flex-col gap-1 text-sm" data-testid={testIds.display}>
      <p data-testid="integration-schedule">
        {typeof cron !== 'string'
          ? t('console.integrationConfig.noSchedule')
          : t('console.integrationConfig.schedule', { params: { when: summary ?? cron, zone } })}
      </p>
      {settings.length === 0 ? null : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          {settings.map(([key, setting]) => (
            <div key={key} className="contents">
              <dt className="font-mono text-muted-foreground">{key}</dt>
              <dd className="font-mono break-all">{shown(setting)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
