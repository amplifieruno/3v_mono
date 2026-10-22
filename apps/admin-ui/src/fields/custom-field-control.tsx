import { useT } from '@burojs/react';
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@burojs/ui-shadcn';
import type * as React from 'react';
import type { AttributeDefinition } from './custom-fields-check';

/** The select item standing for "no value" (Radix refuses an empty item value). */
const UNSET = '__unset__';

export interface CustomFieldControlProps {
  readonly definition: AttributeDefinition;
  /** The stored value under the attribute's key (`undefined` when absent). */
  readonly value: unknown;
  /** `undefined` removes the key: an empty control stores nothing, so `required` can catch it. */
  readonly onChange: (next: unknown) => void;
  readonly onBlur?: () => void;
  readonly id: string;
  readonly disabled: boolean;
  readonly invalid: boolean;
}

/** A stored value as the text a text box shows (a wrong-typed value shows as is, for the user to fix). */
const asText = (value: unknown): string =>
  value === undefined || value === null ? '' : typeof value === 'string' ? value : JSON.stringify(value);

/**
 * One attribute's control by data type: text and number boxes, a date box (`YYYY-MM-DD`),
 * and a select for yes/no and for a select attribute's options, each with "not set".
 */
export function CustomFieldControl(props: CustomFieldControlProps): React.ReactElement {
  const { definition, value, onChange, onBlur, id, disabled, invalid } = props;
  const t = useT();
  const common = { id, disabled, onBlur, 'aria-invalid': invalid || undefined } as const;

  if (definition.data_type === 'boolean' || definition.data_type === 'enum') {
    const options =
      definition.data_type === 'boolean'
        ? [
            { value: 'true', label: t('console.customFields.yes') },
            { value: 'false', label: t('console.customFields.no') },
          ]
        : (definition.options ?? []).map((option) => ({ value: option, label: option }));
    const current = value === undefined || value === null ? UNSET : asText(value);
    // A stored value that is no longer an option stays visible (and is refused on save).
    const stale = current !== UNSET && !options.some((option) => option.value === current);
    return (
      <Select
        value={current}
        disabled={disabled}
        onValueChange={(next) => {
          if (next === UNSET) onChange(undefined);
          else if (definition.data_type === 'boolean') onChange(next === 'true');
          else onChange(next);
          onBlur?.();
        }}
      >
        <SelectTrigger id={id} aria-invalid={invalid || undefined} className="max-w-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNSET}>{t('console.customFields.unset')}</SelectItem>
          {stale ? <SelectItem value={current}>{current}</SelectItem> : null}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (definition.data_type === 'number') {
    return (
      <Input
        {...common}
        type="number"
        className="max-w-sm"
        value={asText(value)}
        onChange={(event) => {
          const raw = event.target.value;
          onChange(raw === '' ? undefined : Number(raw));
        }}
      />
    );
  }

  return (
    <Input
      {...common}
      type={definition.data_type === 'date' ? 'date' : 'text'}
      className="max-w-sm"
      value={asText(value)}
      onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
    />
  );
}
