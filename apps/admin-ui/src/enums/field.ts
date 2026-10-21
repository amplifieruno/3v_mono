import { type EnumFieldDef, type EnumFieldOpts, f } from '@burojs/field-types';

/**
 * An enum field bound to a registered enum (`defineEnum`): `f.enum` plus the
 * enum's name in both places buro reads it, `meta.enumNamespace` (labels) and
 * `ui.enum` (options and badge colours). A field with only one of them renders
 * an empty select or bare values, so every enum field of the console is built
 * here; `tests/enums/enum-fields.test.ts` fails on one that is not.
 */
export function enumField<
  const V extends readonly [string, ...string[]],
  const O extends EnumFieldOpts<V> = Record<never, never>,
>(
  values: V,
  namespace: string,
  opts?: O,
): EnumFieldDef<V, O & { meta: { enumNamespace: string } }> & { ui: { enum: string } } {
  // Only `meta` is added, so the static options (`required`, `write`, …) stay those of `O`.
  const withMeta = Object.assign({}, opts, { meta: { ...opts?.meta, enumNamespace: namespace } });
  const base = f.enum(values, withMeta);
  return { ...base, ui: { ...base.ui, enum: namespace } };
}
