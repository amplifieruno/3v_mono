import { useT } from '@burojs/react';
import { Button, Input } from '@burojs/ui-shadcn';
import { X } from 'lucide-react';
import type * as React from 'react';
import { type TimeWindow, isOvernight } from './time-windows-format';

export interface TimeWindowRowProps {
  readonly index: number;
  readonly window: TimeWindow;
  /** Short weekday names, ISO Monday first. */
  readonly dayNames: readonly string[];
  readonly locked: boolean;
  readonly idPrefix: string;
  readonly onChange: (window: TimeWindow) => void;
  readonly onRemove: () => void;
}

const WEEK = [1, 2, 3, 4, 5, 6, 7] as const;

/** One window: seven weekday toggles, from and to (`HH:MM`, `to` may be `24:00`), remove. */
export function TimeWindowRow({
  index,
  window,
  dayNames,
  locked,
  idPrefix,
  onChange,
  onRemove,
}: TimeWindowRowProps): React.ReactElement {
  const t = useT();
  const number = index + 1;
  const toggle = (day: number): void => {
    const days = window.days.includes(day)
      ? window.days.filter((d) => d !== day)
      : [...window.days, day].sort((a, b) => a - b);
    onChange({ ...window, days });
  };
  const time = (key: 'from' | 'to') => (
    <Input
      id={`${idPrefix}-${key}`}
      aria-label={`${t(`console.timeWindows.${key}`)} (${t('console.timeWindows.window', { params: { index: number } })})`}
      className="w-20 font-mono"
      inputMode="numeric"
      maxLength={5}
      placeholder={t('console.timeWindows.timeHint')}
      value={window[key]}
      disabled={locked}
      onChange={(event) => onChange({ ...window, [key]: event.target.value })}
    />
  );

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={`${idPrefix}-row`}>
      <div
        role="group"
        aria-label={t('console.timeWindows.days', { params: { index: number } })}
        className="flex flex-wrap gap-1"
      >
        {WEEK.map((day) => {
          const on = window.days.includes(day);
          return (
            <Button
              key={day}
              type="button"
              size="sm"
              variant={on ? 'default' : 'outline'}
              aria-pressed={on}
              disabled={locked}
              className="w-11 px-0"
              onClick={() => toggle(day)}
            >
              {dayNames[day - 1]}
            </Button>
          );
        })}
      </div>
      <div className="flex items-center gap-1">
        {time('from')}
        <span aria-hidden>–</span>
        {time('to')}
      </div>
      {isOvernight(window) ? (
        <span className="text-xs text-muted-foreground">
          {t('console.timeWindows.endsNextDay')}
        </span>
      ) : null}
      {locked ? null : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t('console.timeWindows.remove', { params: { index: number } })}
          onClick={onRemove}
        >
          <X className="size-4" aria-hidden />
        </Button>
      )}
    </div>
  );
}
