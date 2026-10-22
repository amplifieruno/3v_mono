/**
 * A list of distinct, non-empty texts in a `jsonb` column, such as the options of a
 * select custom attribute (`custom_attribute_definitions.options`, which
 * `itap.validate_custom_fields` matches values against as JSON strings).
 */

/** How one entry is named in messages: `Option` → "Option 2 is empty.", "Add at least one option." */
export interface StringListNoun {
  readonly item: string;
}

/** `null` when `value` is a non-empty list of distinct, non-blank strings (or nothing), else the first problem. */
export function validateStringList(value: unknown, { item }: StringListNoun): string | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return `${item}s must be a list.`;
  if (value.length === 0) return `Add at least one ${item.toLowerCase()}.`;
  const seen = new Map<string, number>();
  for (const [index, entry] of value.entries()) {
    const number = index + 1;
    if (typeof entry !== 'string') return `${item} ${number} is not text.`;
    if (entry.trim() === '') return `${item} ${number} is empty.`;
    const first = seen.get(entry);
    if (first !== undefined) return `${item} ${number} repeats ${item.toLowerCase()} ${first}.`;
    seen.set(entry, number);
  }
  return null;
}

/** The entries as editable rows: a stored non-list reads as no rows, a non-text entry as an empty row. */
export function rowsOfStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry: unknown) => (typeof entry === 'string' ? entry : ''));
}
