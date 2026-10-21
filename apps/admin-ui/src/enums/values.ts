import type { EnumColor } from '@burojs/core';

/**
 * An enum's members from its value list and a colour per value. The record
 * type makes a colour mandatory for every value, so the members always follow
 * the value list the fields use (`f.enum(VALUES, …)`).
 */
export function enumValues<const V extends string>(
  values: readonly V[],
  colors: Readonly<Record<V, EnumColor>>,
): { value: V; color: EnumColor }[] {
  return values.map((value) => ({ value, color: colors[value] }));
}
