import { useT } from '@burojs/react';
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { instantOf, localInputOf, numberOf } from './segment-conditions-input-values';
import { isDateType, isRelative } from './segment-conditions-operators';

export interface ScalarValueProps {
  readonly id: string;
  readonly label: string;
  /** The catalog type: text, integer, number, date or timestamp. */
  readonly type: string;
  readonly value: unknown;
  readonly invalid: boolean;
  readonly disabled: boolean;
  readonly onChange: (next: unknown) => void;
  readonly onBlur?: () => void;
}

const shown = (value: unknown): string => (typeof value === 'number' || typeof value === 'string' ? String(value) : '');

/**
 * One value of a condition: a text box, a number box, or for dates and timestamps either an
 * absolute date (and time) or a number of days from the evaluation day (`{"relative_days": n}`,
 * negative = ago), resolved when the segment is evaluated.
 */
export function ScalarValue(props: ScalarValueProps): React.ReactElement {
  const { id, label, type, value, invalid, disabled, onChange, onBlur } = props;
  const t = useT();
  const common = { id, 'aria-label': label, 'aria-invalid': invalid || undefined, disabled, ...(onBlur === undefined ? {} : { onBlur }) };
  if (type === 'integer' || type === 'number') {
    return (
      <Input
        {...common}
        type="number"
        step={type === 'integer' ? 1 : 'any'}
        className="w-32"
        value={shown(value)}
        onChange={(event) => onChange(numberOf(event.target.value))}
      />
    );
  }
  if (!isDateType(type)) {
    return <Input {...common} className="w-56" value={shown(value)} onChange={(event) => onChange(event.target.value)} />;
  }
  const relative = isRelative(value);
  const days = relative ? shown(value.relative_days) : '';
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Select
        value={relative ? 'relative' : 'absolute'}
        disabled={disabled}
        onValueChange={(mode) => onChange(mode === 'relative' ? { relative_days: 0 } : null)}
      >
        <SelectTrigger className="w-40" aria-label={t('console.segmentConditions.dateMode', { params: { label } })}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="absolute">{t(`console.segmentConditions.${type === 'date' ? 'onDate' : 'atTime'}`)}</SelectItem>
          <SelectItem value="relative">{t(`console.segmentConditions.${type === 'date' ? 'relativeDay' : 'relativeTime'}`)}</SelectItem>
        </SelectContent>
      </Select>
      {relative ? (
        <>
          <Input
            {...common}
            type="number"
            step={1}
            className="w-24"
            value={days}
            onChange={(event) => onChange({ relative_days: numberOf(event.target.value) })}
          />
          <span className="text-xs text-muted-foreground">
            {t(`console.segmentConditions.${type === 'date' ? 'daysFromToday' : 'daysFromNow'}`)}
          </span>
        </>
      ) : type === 'date' ? (
        <Input {...common} type="date" className="w-44" value={shown(value)} onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)} />
      ) : (
        <Input {...common} type="datetime-local" className="w-56" value={localInputOf(value)} onChange={(event) => onChange(instantOf(event.target.value))} />
      )}
    </span>
  );
}
