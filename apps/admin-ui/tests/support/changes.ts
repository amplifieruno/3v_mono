/** The changes of an `updateOne` that writes `input` as it stands (a provider call, no form diff). */
export function setChanges(input: Readonly<Record<string, unknown>>) {
  return Object.entries(input).map(([field, value]) => ({ op: 'set' as const, path: [field], value }));
}
