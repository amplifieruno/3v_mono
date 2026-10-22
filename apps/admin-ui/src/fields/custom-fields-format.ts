/** How a stored attribute value reads: yes/no for booleans, texts as they are, anything else as JSON. */
export function formatAttributeValue(
  value: unknown,
  words: { readonly yes: string; readonly no: string },
): string {
  if (value === true) return words.yes;
  if (value === false) return words.no;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value) ?? '';
}
