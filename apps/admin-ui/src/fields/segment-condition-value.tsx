import { useT } from '@burojs/react';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@burojs/ui-shadcn';
import { Plus, X } from 'lucide-react';
import type * as React from 'react';
import { ChoicePicker } from './segment-choice-picker';
import { ScalarValue } from './segment-condition-scalar';
import { type ConditionsEditor, useConditionsEditor } from './segment-conditions-context';
import { humanize } from './segment-conditions-format';
import { type CatalogField, defaultScalar, isReferenceType, shapeOf } from './segment-conditions-operators';
import { referenceChoices } from './segment-conditions-refs';

export interface ConditionValueProps {
  readonly id: string;
  /** The field's catalog entry; `undefined` for a field the catalog does not offer. */
  readonly spec: CatalogField | undefined;
  readonly operator: string;
  readonly value: unknown;
  readonly invalid: boolean;
  readonly onChange: (next: unknown) => void;
}

const asList = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

/** The choices of an enum or reference field, or `null` for a typed value. */
function choicesOf(spec: CatalogField, editor: ConditionsEditor): { readonly value: string; readonly label: string }[] | null {
  if (spec.type === 'enum') return (spec.enumValues ?? []).map((value) => ({ value, label: humanize(value) }));
  if (isReferenceType(spec.type)) return referenceChoices(spec.type, editor.refs, editor.target, editor.self);
  return null;
}

/**
 * The value editor of one condition, by the field's type and the operator's shape: empty / not
 * empty (`is_null`), yes / no, a pick (enum values, the organization's records; several for
 * `in` / `nin`), a typed value, a list of typed values, or a low and a high bound (`between`).
 * A value of a field the catalog does not offer is shown as stored.
 */
export function ConditionValue(props: ConditionValueProps): React.ReactElement {
  const { id, spec, operator, value, invalid, onChange } = props;
  const editor = useConditionsEditor();
  const t = useT();
  const choices = spec === undefined ? null : choicesOf(spec, editor);
  const label = t('console.segmentConditions.value');
  const blur = editor.onBlur === undefined ? {} : { onBlur: editor.onBlur };
  if (spec === undefined) return <code className="text-xs text-muted-foreground">{JSON.stringify(value)}</code>;
  const shape = shapeOf(operator);
  if (shape === 'flag' || spec.type === 'boolean') {
    const options = shape === 'flag' ? (['isEmpty', 'notEmpty'] as const) : (['yes', 'no'] as const);
    const current = value === true ? options[0] : value === false ? options[1] : '';
    return (
      <Select value={current} disabled={editor.locked} onValueChange={(next) => onChange(next === options[0])}>
        <SelectTrigger id={id} className="w-36" aria-label={label} aria-invalid={invalid || undefined}>
          <SelectValue placeholder={t('console.segmentConditions.choose')} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {t(`console.segmentConditions.${option}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (choices !== null) {
    const multiple = shape === 'list';
    const selected = (multiple ? asList(value) : [value]).filter((item): item is string => typeof item === 'string' && item !== '');
    return (
      <ChoicePicker
        id={id}
        label={label}
        choices={choices}
        selected={selected}
        multiple={multiple}
        unknownLabel={(stored) => t('console.segmentConditions.unknownRecord', { params: { id: stored } })}
        invalid={invalid}
        disabled={editor.locked}
        onChange={(next) => onChange(multiple ? [...next] : (next[0] ?? null))}
        {...blur}
      />
    );
  }
  const scalar = (at: string, current: unknown, write: (next: unknown) => void, name = label) => (
    <ScalarValue id={at} label={name} type={spec.type} value={current} invalid={invalid} disabled={editor.locked} onChange={write} {...blur} />
  );
  if (shape === 'pair') {
    const [low, high] = Array.isArray(value) ? value : [value, null];
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        {scalar(id, low, (next) => onChange([next, high ?? null]), t('console.segmentConditions.low'))}
        <span className="text-sm text-muted-foreground">{t('console.segmentConditions.and')}</span>
        {scalar(`${id}-high`, high, (next) => onChange([low ?? null, next]), t('console.segmentConditions.high'))}
      </span>
    );
  }
  if (shape === 'list') {
    const items = asList(value);
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        {items.map((item, index) => (
          // List entries have no identity of their own; the position is the key.
          <span key={index} className="inline-flex items-center gap-1">
            {scalar(`${id}-${index}`, item, (next) => onChange(items.map((old, i) => (i === index ? next : old))))}
            {editor.locked ? null : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={t('console.segmentConditions.removeValue', { params: { index: index + 1 } })}
                onClick={() => onChange(items.filter((_, i) => i !== index))}
              >
                <X className="size-4" aria-hidden />
              </Button>
            )}
          </span>
        ))}
        {editor.locked ? null : (
          <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, defaultScalar(spec)])}>
            <Plus className="size-4" aria-hidden />
            {t('console.segmentConditions.addValue')}
          </Button>
        )}
      </span>
    );
  }
  return scalar(id, value, onChange);
}
