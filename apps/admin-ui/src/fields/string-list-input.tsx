import { type ScalarInputProps, useT } from '@burojs/react';
import { Button, Input } from '@burojs/ui-shadcn';
import { Plus, X } from 'lucide-react';
import type * as React from 'react';
import { rowsOfStringList } from './string-list-format';
import type { StringListMeta } from './string-list-meta';

/**
 * One text box per entry, with remove and add. Every edit writes the whole list as
 * typed; the field's validator names an empty or repeated entry on save. Removing the
 * last row writes `null` for a nullable column, else `[]`.
 */
export function StringListInput(
  props: ScalarInputProps<unknown, StringListMeta>,
): React.ReactElement {
  const { value, onChange, onBlur, disabled, readOnly, accessibility, testIds, meta } = props;
  const t = useT();
  const rows = rowsOfStringList(value);
  const locked = disabled === true || readOnly === true;
  const prefix = accessibility.input ?? 'string-list';
  const item = meta.item.toLowerCase();
  const write = (next: string[]): void =>
    onChange?.(next.length === 0 && meta.nullable ? null : next);

  return (
    <div
      className="flex flex-col gap-2"
      data-testid={testIds.input}
      aria-describedby={accessibility.description}
    >
      {rows.map((row, index) => (
        // Rows have no identity of their own; the position is the key.
        <div key={index} className="flex items-center gap-2">
          <Input
            id={`${prefix}-${index}`}
            aria-label={`${meta.item} ${index + 1}`}
            className="max-w-sm"
            value={row}
            disabled={locked}
            onChange={(event) => write(rows.map((r, i) => (i === index ? event.target.value : r)))}
            onBlur={onBlur}
          />
          {locked ? null : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={t('console.stringList.remove', { params: { item, index: index + 1 } })}
              onClick={() => write(rows.filter((_, i) => i !== index))}
            >
              <X className="size-4" aria-hidden />
            </Button>
          )}
        </div>
      ))}
      {locked ? null : (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => write([...rows, ''])}>
            <Plus className="size-4" aria-hidden />
            {t('console.stringList.add', { params: { item } })}
          </Button>
        </div>
      )}
    </div>
  );
}
