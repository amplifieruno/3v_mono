/** The field implementation id of {@link inRecordScope} (`./record-scoped-relation-impl.ts`). */
export const RECORD_SCOPED_RELATION_FIELD = 'itap.record-scoped-relation';

export interface RecordScopeOptions {
  /** The relation's target; its `data.scope` mapping names the scope keys the frame carries. */
  readonly resource: string;
  /** The target's field the frame sets (`facility_id`). */
  readonly field: string;
  /** Its value, read beside the form (`ref('record', 'id')` in a facility's flow form). */
  readonly value: { readonly kind: 'ref'; readonly source: string; readonly path: readonly string[] };
}

interface RelationDeclaration {
  readonly ui?: Readonly<Record<string, unknown>>;
  readonly meta?: Readonly<Record<string, unknown>>;
}

/**
 * A relation select whose options are read in a record scope the form does not carry itself:
 * the select is wrapped in `RecordScopeProvider` with `{ [field]: value }`, so the sidebar
 * selection does not narrow it. For a form outside a record of the target's scope, such as the
 * facility's "Apply template" flow (the facility has no `facility_id`, the areas offered are
 * this facility's whatever the sidebar holds).
 */
export function inRecordScope<F extends RelationDeclaration>(field: F, opts: RecordScopeOptions): F {
  return {
    ...field,
    ui: { ...field.ui, input: RECORD_SCOPED_RELATION_FIELD },
    meta: { ...field.meta, scopeResource: opts.resource, scopeField: opts.field, scopeValue: opts.value },
  };
}
