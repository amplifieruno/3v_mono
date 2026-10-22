import { f } from '@burojs/field-types';

/**
 * A record id a flow carries in its values for its review step, never shown: a flow's review
 * reads the flow's values as its record (`tasks/ui/buro-gaps.md` G35), so a block placed there
 * reads the id with `ref('record', <this field>)`. Fill it from the form's `initial` (a ref to the
 * flow's record).
 */
export function carriedId(what: string) {
  return f.string({
    in: [],
    nullable: true,
    texts: { label: what, doc: { summary: `The ${what.toLowerCase()} this flow acts on, carried for its review.` } },
  });
}
