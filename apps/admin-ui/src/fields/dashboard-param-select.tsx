import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@burojs/ui-shadcn';
import type * as React from 'react';

/** The select item standing for "no value": the key is removed (Radix refuses an empty item value). */
export const UNSET = '__default__';

export interface ParamSelectProps {
  readonly id: string;
  /** The chosen option, or {@link UNSET}. */
  readonly value: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly onChange: (value: string) => void;
  readonly disabled: boolean;
  readonly invalid?: boolean;
}

/**
 * One choice of a widget's settings (`itap.dashboard-widgets`). A stored value that is no longer an
 * option stays visible as itself, so the refusal under the widget names something on screen.
 */
export function ParamSelect({ id, value, options, onChange, disabled, invalid }: ParamSelectProps): React.ReactElement {
  const stale = value !== UNSET && !options.some((option) => option.value === value);
  return (
    <Select value={value} disabled={disabled} onValueChange={onChange}>
      <SelectTrigger id={id} aria-invalid={invalid || undefined} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {stale ? <SelectItem value={value}>{value}</SelectItem> : null}
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
