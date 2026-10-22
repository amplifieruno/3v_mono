import { type ScalarDisplayProps, useT } from '@burojs/react';
import { TriangleAlert } from 'lucide-react';
import type * as React from 'react';
import { cronNeverRuns, cronSummary, parseCron } from './cron-format';
import { useCronPhrase } from './cron-phrase';

/**
 * A schedule as a sentence (`At 07:00 on Monday`), with the expression beside it except in a list
 * cell. A cron the database would refuse keeps its text and is flagged; one that can never run says so.
 */
export function CronDisplay(props: ScalarDisplayProps<unknown>): React.ReactElement {
  const t = useT();
  const phrase = useCronPhrase();
  const { value, testIds, presentation, i18n } = props;
  if (typeof value !== 'string' || value.trim() === '') return <span className="text-muted-foreground">—</span>;
  const cron = parseCron(value);
  const summary = cronSummary(value, phrase, i18n.locale);
  if (cron === null || summary === null) {
    return (
      <span className="inline-flex items-center gap-1 text-destructive" data-testid={testIds.display} data-invalid="true">
        <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
        {value} — {t('console.cron.invalid')}
      </span>
    );
  }
  const never = cronNeverRuns(cron);
  return (
    <span data-testid={testIds.display} title={value}>
      {summary}
      {presentation === 'plain' ? null : <code className="ml-2 font-mono text-xs text-muted-foreground">{value.trim()}</code>}
      {never ? (
        <span className="ml-2 inline-flex items-center gap-1 text-destructive">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          {phrase('never')}
        </span>
      ) : null}
    </span>
  );
}
