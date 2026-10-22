import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@burojs/ui-shadcn';
import type * as React from 'react';

/** The select's value for "any" (Radix refuses an empty item value). */
export const ANY = '__any';

/** One record (or severity) a condition can name. */
export interface ConditionChoice {
  readonly value: string;
  readonly label: React.ReactNode;
}

export interface ConditionRowProps {
  readonly id: string;
  readonly label: string;
  readonly anyLabel: string;
  readonly hint: string;
  /** The stored value, `undefined` for "any". */
  readonly current: string | undefined;
  readonly choices: readonly ConditionChoice[];
  /** How a stored value that is not among the choices reads (a deleted record). */
  readonly unknownLabel: (value: string) => string;
  /** The row's own problem, shown under it. */
  readonly problem: string | undefined;
  readonly invalid: boolean;
  readonly disabled: boolean;
  readonly onChange: (next: string | undefined) => void;
  readonly onBlur?: () => void;
}

/** One condition of a notification rule: its label, "any" or a choice, a hint and its problem. */
export function ConditionRow(props: ConditionRowProps): React.ReactElement {
  const { id, current, choices, invalid, problem } = props;
  const stale = current !== undefined && !choices.some((choice) => choice.value === current);
  const problemId = `${id}-problem`;
  return (
    <div className="flex flex-col gap-1" data-testid={`condition-${id}`} data-invalid={invalid || undefined}>
      <Label htmlFor={id}>{props.label}</Label>
      <Select
        value={current ?? ANY}
        disabled={props.disabled}
        onValueChange={(next) => props.onChange(next === ANY ? undefined : next)}
        {...(props.onBlur === undefined ? {} : { onOpenChange: (open: boolean) => (open ? undefined : props.onBlur?.()) })}
      >
        <SelectTrigger
          id={id}
          className="max-w-md"
          aria-invalid={invalid || undefined}
          {...(problem === undefined ? {} : { 'aria-describedby': problemId })}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{props.anyLabel}</SelectItem>
          {stale ? <SelectItem value={current}>{props.unknownLabel(current)}</SelectItem> : null}
          {choices.map((choice) => (
            <SelectItem key={choice.value} value={choice.value}>
              {choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-xs text-muted-foreground">{props.hint}</span>
      {problem === undefined ? null : (
        <span id={problemId} role="alert" className="text-xs text-destructive">
          {problem}
        </span>
      )}
    </div>
  );
}
