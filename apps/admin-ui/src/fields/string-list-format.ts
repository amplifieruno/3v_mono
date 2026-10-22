/**
 * A list of distinct, non-empty texts in a `jsonb` column, such as the options of a
 * select custom attribute (`custom_attribute_definitions.options`, which
 * `itap.validate_custom_fields` matches values against as JSON strings).
 */
import type { FieldProblem } from './field-issue';

/** How one entry is named in messages: `Option` → "Option 2 is empty.", "Add at least one option." */
export interface StringListNoun {
  readonly item: string;
}

/**
 * `null` when `value` is a non-empty list of distinct, non-blank strings (or nothing), else
 * the first problem (code `stringList.<reason>`, params `item`, `itemLower`, `index`, `first`).
 */
export function validateStringList(value: unknown, { item }: StringListNoun): FieldProblem | null {
  if (value === null || value === undefined) return null;
  const itemLower = item.toLowerCase();
  const nouns = { item, itemLower };
  if (!Array.isArray(value)) {
    return { code: 'stringList.notList', text: `${item}s must be a list.`, params: nouns };
  }
  if (value.length === 0) {
    return { code: 'stringList.none', text: `Add at least one ${itemLower}.`, params: nouns };
  }
  const seen = new Map<string, number>();
  for (const [position, entry] of value.entries()) {
    const index = position + 1;
    const params = { ...nouns, index };
    if (typeof entry !== 'string') {
      return { code: 'stringList.notText', text: `${item} ${index} is not text.`, params };
    }
    if (entry.trim() === '') {
      return { code: 'stringList.blank', text: `${item} ${index} is empty.`, params };
    }
    const first = seen.get(entry);
    if (first !== undefined) {
      return {
        code: 'stringList.repeated',
        text: `${item} ${index} repeats ${itemLower} ${first}.`,
        params: { ...params, first },
      };
    }
    seen.set(entry, index);
  }
  return null;
}

/** The entries as editable rows: a stored non-list reads as no rows, a non-text entry as an empty row. */
export function rowsOfStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry: unknown) => (typeof entry === 'string' ? entry : ''));
}
