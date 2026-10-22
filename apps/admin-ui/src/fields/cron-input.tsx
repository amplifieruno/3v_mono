import { type ScalarInputProps, useT } from '@burojs/react';
import { Button, Input } from '@burojs/ui-shadcn';
import { TriangleAlert } from 'lucide-react';
import type * as React from 'react';
import { cronNeverRuns, cronSummary, parseCron } from './cron-format';
import { useCronPhrase } from './cron-phrase';

/** Common schedules offered beside the expression (a click writes it). */
const CRON_PRESETS = [
  { key: 'daily', cron: '0 7 * * *' },
  { key: 'weekdays', cron: '0 7 * * 1-5' },
  { key: 'weekly', cron: '0 7 * * 1' },
  { key: 'monthly', cron: '0 7 1 * *' },
] as const;

/**
 * The expression as typed, a few common schedules to pick, and what it means under it: the sentence,
 * "never runs" for a date no month has, or why the platform refuses it (the validator refuses it on save).
 */
export function CronInput(props: ScalarInputProps<unknown>): React.ReactElement {
  const { value, onChange, onBlur, disabled, readOnly, accessibility, testIds, issues, i18n } = props;
  const t = useT();
  const phrase = useCronPhrase();
  const text = typeof value === 'string' ? value : '';
  const locked = disabled === true || readOnly === true;
  const cron = parseCron(text);
  const summary = cronSummary(text, phrase, i18n.locale);
  const hintId = `${accessibility.input ?? 'cron'}-summary`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={accessibility.input}
          data-testid={testIds.input}
          className="max-w-xs font-mono"
          value={text}
          placeholder="0 7 * * 1"
          disabled={locked}
          aria-invalid={issues.length > 0 || (text.trim() !== '' && cron === null) || undefined}
          aria-describedby={[accessibility.description, hintId].filter(Boolean).join(' ')}
          onChange={(event) => onChange?.(event.target.value === '' ? null : event.target.value)}
          onBlur={() => onBlur?.()}
        />
        {CRON_PRESETS.map((preset) => (
          <Button
            key={preset.key}
            type="button"
            variant="outline"
            size="sm"
            disabled={locked}
            aria-pressed={text.trim() === preset.cron}
            onClick={() => {
              onChange?.(preset.cron);
              onBlur?.();
            }}
          >
            {t(`console.cron.presets.${preset.key}`)}
          </Button>
        ))}
      </div>
      <p id={hintId} className="text-sm text-muted-foreground" data-testid="cron-summary">
        {text.trim() === '' ? (
          t('console.cron.empty')
        ) : summary === null || cron === null ? (
          <span className="inline-flex items-center gap-1 text-destructive">
            <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
            {t('console.cron.invalid')}
          </span>
        ) : cronNeverRuns(cron) ? (
          <span className="inline-flex items-center gap-1 text-destructive">
            <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
            {summary}. {phrase('never')}
          </span>
        ) : (
          summary
        )}
      </p>
    </div>
  );
}
