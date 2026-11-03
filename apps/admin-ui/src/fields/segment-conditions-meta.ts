import { z } from 'zod';

/** The `meta` a `segmentConditions(...)` field carries (`./segment-conditions.ts`). */
export const segmentConditionsMeta = z.object({
  /** The record field holding the segment's target (`target`: `profiles` / `identities`). */
  targetField: z.string(),
  /** The form value the field reads: buro hands a field only what its refs name. */
  reads: z.array(z.unknown()).optional(),
});

export type SegmentConditionsMeta = z.infer<typeof segmentConditionsMeta>;

/** The target of the record or form, or `undefined` before one is chosen. */
export function targetOf(
  props: { readonly record?: Readonly<Record<string, unknown>>; readonly refValues?: Readonly<Record<string, unknown>> },
  targetField: string,
): string | undefined {
  const target = props.refValues?.[targetField] ?? props.record?.[targetField];
  return typeof target === 'string' && target !== '' ? target : undefined;
}
