import type { ScalarInputProps } from '@burojs/react';
import { Input } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { fromLocalInput, toLocalInput } from './date-time-format';

/** The browser's date-and-time picker (`datetime-local`, local time), sending an ISO instant. */
export function DateTimeInput(props: ScalarInputProps<unknown>): React.ReactElement {
  const { value, onChange, onBlur, disabled, readOnly, accessibility, testIds, issues } = props;
  return (
    <Input
      id={accessibility.input}
      type="datetime-local"
      value={toLocalInput(value)}
      onChange={(event) => onChange?.(fromLocalInput(event.target.value))}
      onBlur={onBlur}
      disabled={disabled}
      readOnly={readOnly}
      aria-invalid={issues.length > 0 || undefined}
      aria-describedby={accessibility.description}
      data-testid={testIds.input}
    />
  );
}
