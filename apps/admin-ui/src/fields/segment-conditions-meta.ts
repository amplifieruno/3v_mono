import { z } from 'zod';

/** The `meta` a `segmentConditions(...)` field carries (`./segment-conditions.ts`). */
export const segmentConditionsMeta = z.object({
  /** The record field holding the segment's target (`target`: `profiles` / `identities`). */
  targetField: z.string(),
});

export type SegmentConditionsMeta = z.infer<typeof segmentConditionsMeta>;

/** The target of the record or form, or `undefined` before one is chosen. */
export function targetOf(
  props: { readonly record?: Readonly<Record<string, unknown>>; readonly form?: Readonly<Record<string, unknown>> },
  targetField: string,
): string | undefined {
  const target = props.form?.[targetField] ?? props.record?.[targetField];
  return typeof target === 'string' && target !== '' ? target : undefined;
}
