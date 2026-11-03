import { f } from '@burojs/field-types';

/**
 * A record id a flow carries in its values for its review step, never shown: a block placed
 * there reads the id with `ref('values', <this field>)`. Fill it from the form's `initial` (a ref
 * to the flow's record).
 */
export function carriedId(what: string) {
  return f.string({
    in: [],
    nullable: true,
    texts: { label: what, doc: { summary: `The ${what.toLowerCase()} this flow acts on, carried for its review.` } },
  });
}
