/**
 * Declared saved views with the list's opening `sort` / `pageSize` as their base: a view applies
 * on a blank state (buro 0.7, A86), so a view that does not say its order would read in the
 * provider's. For views kept in a constant; a view written in place states its own.
 */
export function viewsOpeningAs<const V extends ReadonlyArray<{ readonly state?: object }>>(
  initial: { readonly sort?: unknown; readonly pageSize?: number },
  views: V,
): V {
  return views.map((view) => ({ ...view, state: { ...initial, ...view.state } })) as unknown as V;
}
