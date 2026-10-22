import { useT } from '@burojs/react';
import {
  Button,
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from '@burojs/ui-shadcn';
import { Check, ChevronDown } from 'lucide-react';
import * as React from 'react';
import { sameId } from './segment-conditions-refs';

export interface Choice {
  readonly value: string;
  readonly label: string;
}

export interface ChoicePickerProps {
  readonly id: string;
  readonly label: string;
  readonly choices: readonly Choice[];
  /** The chosen values (one for a single choice). */
  readonly selected: readonly string[];
  readonly multiple: boolean;
  /** How a chosen value that is not among the choices reads (a deleted record, a value no longer offered). */
  readonly unknownLabel: (value: string) => string;
  readonly invalid: boolean;
  readonly disabled: boolean;
  readonly onChange: (next: readonly string[]) => void;
  readonly onBlur?: () => void;
}

/**
 * A searchable pick from a list (enum values, the organization's records): one value, or several
 * ticked for `in` / `nin`. Values compare as ids (case-insensitively) so a stored id finds its
 * record whatever its spelling; a chosen value missing from the list stays shown.
 */
export function ChoicePicker(props: ChoicePickerProps): React.ReactElement {
  const { id, choices, selected, multiple, invalid, disabled } = props;
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const isChosen = (value: string) => selected.some((chosen) => sameId(chosen, value));
  const labelOf = (value: string) => choices.find((choice) => sameId(choice.value, value))?.label ?? props.unknownLabel(value);
  const summary = selected.length === 0 ? t('console.segmentConditions.choose') : selected.map(labelOf).join(', ');
  const pick = (value: string): void => {
    if (!multiple) {
      props.onChange([value]);
      setOpen(false);
      return;
    }
    props.onChange(isChosen(value) ? selected.filter((chosen) => !sameId(chosen, value)) : [...selected, value]);
  };
  const missing = selected.filter((value) => !choices.some((choice) => sameId(choice.value, value)));
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) props.onBlur?.();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-label={props.label}
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className="min-w-40 max-w-md justify-between font-normal"
        >
          <span className={cn('truncate text-left', selected.length === 0 && 'text-muted-foreground')}>{summary}</span>
          <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          {choices.length > 7 ? <CommandInput placeholder={t('console.segmentConditions.search')} /> : null}
          <CommandList>
            <CommandEmpty>{t('console.segmentConditions.noChoices')}</CommandEmpty>
            {missing.map((value) => (
              <CommandItem key={`missing-${value}`} value={`${value} ${props.unknownLabel(value)}`} onSelect={() => pick(value)}>
                <Check className="size-4" aria-hidden />
                {props.unknownLabel(value)}
              </CommandItem>
            ))}
            {choices.map((choice) => (
              <CommandItem key={choice.value} value={`${choice.label} ${choice.value}`} onSelect={() => pick(choice.value)}>
                <Check className={cn('size-4', isChosen(choice.value) ? 'opacity-100' : 'opacity-0')} aria-hidden />
                {choice.label}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
