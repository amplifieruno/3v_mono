import { type ScalarInputProps, useT } from '@burojs/react';
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
} from '@burojs/ui-shadcn';
import { Check, ChevronsUpDown, TriangleAlert, X } from 'lucide-react';
import * as React from 'react';
import type { TimezoneMeta } from './timezone-meta';
import { timezoneOffset, timezoneOptions } from './timezone-zones';

/**
 * A searchable list of IANA zones with their current UTC offset (`UTC` first). A
 * stored zone the browser does not know stays selected and is flagged on the trigger;
 * the field's validator refuses it on save. An optional zone has Clear next to the list.
 */
export function TimezoneInput(props: ScalarInputProps<unknown, TimezoneMeta>): React.ReactElement {
  const { value, onChange, onBlur, disabled, readOnly, accessibility, testIds, issues, meta } =
    props;
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const zone = typeof value === 'string' && value !== '' ? value : null;
  const offset = zone === null ? null : timezoneOffset(zone);
  const unknown = zone !== null && offset === null;
  const locked = disabled === true || readOnly === true;
  const clearable = meta.nullable && zone !== null && !locked;
  // Offsets are computed when the list opens, so they follow daylight saving.
  const options = React.useMemo(() => {
    if (!open) return [];
    const all = timezoneOptions();
    // A valid stored alias the browser does not list (`Asia/Kolkata` vs `Asia/Calcutta`) stays pickable.
    return zone !== null && offset !== null && !all.some((option) => option.zone === zone)
      ? [{ zone, offset }, ...all]
      : all;
  }, [open, zone, offset]);

  return (
    <div className="flex items-center gap-1">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) onBlur?.();
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-invalid={unknown || issues.length > 0 || undefined}
            aria-describedby={accessibility.description}
            id={accessibility.input}
            data-testid={testIds.input}
            disabled={locked}
            className="w-full min-w-0 flex-1 justify-between font-normal"
          >
            {zone === null ? (
              <span className="text-muted-foreground">{t('console.timezone.placeholder')}</span>
            ) : unknown ? (
              <span className="inline-flex items-center gap-1 truncate text-destructive">
                <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                {zone} — {t('console.timezone.unknown')}
              </span>
            ) : (
              <span className="truncate">
                {zone} <span className="text-muted-foreground">({offset})</span>
              </span>
            )}
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput
              placeholder={t('console.timezone.search')}
              aria-label={t('console.timezone.search')}
            />
            <CommandList>
              <CommandEmpty>{t('console.timezone.empty')}</CommandEmpty>
              {options.map((option) => (
                <CommandItem
                  key={option.zone}
                  value={`${option.zone} ${option.offset}`}
                  onSelect={() => {
                    onChange?.(option.zone);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={`size-4 shrink-0 ${option.zone === zone ? 'opacity-100' : 'opacity-0'}`}
                    aria-hidden
                  />
                  <span className="truncate">{option.zone}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{option.offset}</span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {clearable ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t('console.timezone.clear')}
          data-testid={testIds.input === undefined ? undefined : `${testIds.input}-clear`}
          onClick={() => {
            onChange?.(null);
            onBlur?.();
          }}
        >
          <X className="size-4" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
