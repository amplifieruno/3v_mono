import { type ScalarInputProps, useT } from '@burojs/react';
import { Button } from '@burojs/ui-shadcn';
import { Plus } from 'lucide-react';
import * as React from 'react';
import { TimeWindowRow } from './time-window-row';
import { type TimeWindow, weekdayNames } from './time-windows-format';
import type { TimeWindowsMeta } from './time-windows-meta';

/** A new row: working days, office hours. */
const NEW_WINDOW: TimeWindow = { days: [1, 2, 3, 4, 5], from: '08:00', to: '18:00' };

/** The stored list as editable rows; a malformed entry becomes an empty row the validator refuses. */
function rowsOf(value: unknown): TimeWindow[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry: unknown) => {
    const w = typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {};
    return {
      days: Array.isArray(w.days) ? w.days.filter((d): d is number => typeof d === 'number') : [],
      from: typeof w.from === 'string' ? w.from : '',
      to: typeof w.to === 'string' ? w.to : '',
    };
  });
}

/**
 * One row per window (weekday toggles, from, to), add and remove. Every edit writes
 * the whole list; a row that does not validate yet stays as typed and the field's
 * validator names it on save. Removing the last row writes `null` for a nullable
 * column, else `[]`.
 */
export function TimeWindowsInput(
  props: ScalarInputProps<unknown, TimeWindowsMeta>,
): React.ReactElement {
  const { value, onChange, disabled, readOnly, accessibility, testIds, meta, i18n } = props;
  const t = useT();
  const rows = rowsOf(value);
  const locked = disabled === true || readOnly === true;
  const dayNames = React.useMemo(() => weekdayNames(i18n.locale), [i18n.locale]);
  const prefix = accessibility.input ?? 'time-windows';
  const write = (next: TimeWindow[]): void =>
    onChange?.(next.length === 0 && meta.nullable ? null : next);

  return (
    <div
      className="flex flex-col gap-2"
      data-testid={testIds.input}
      aria-describedby={accessibility.description}
    >
      {rows.map((row, index) => (
        <TimeWindowRow
          // Rows have no identity of their own; the position is the key.
          key={index}
          index={index}
          window={row}
          dayNames={dayNames}
          locked={locked}
          idPrefix={`${prefix}-${index}`}
          onChange={(next) => write(rows.map((r, i) => (i === index ? next : r)))}
          onRemove={() => write(rows.filter((_, i) => i !== index))}
        />
      ))}
      {rows.length === 0 ? (
        <span className="text-sm text-muted-foreground">{t('console.timeWindows.none')}</span>
      ) : null}
      {locked ? null : (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => write([...rows, NEW_WINDOW])}
          >
            <Plus className="size-4" aria-hidden />
            {t('console.timeWindows.add')}
          </Button>
        </div>
      )}
    </div>
  );
}
