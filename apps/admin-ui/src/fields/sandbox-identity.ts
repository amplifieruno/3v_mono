import { ref } from '@burojs/core';

/** The field implementation id of {@link sandboxIdentity} (`./sandbox-identity-impl.ts`). */
export const SANDBOX_IDENTITY_FIELD = 'itap.sandbox-identity';

interface RelationDeclaration {
  readonly ui?: Readonly<Record<string, unknown>>;
  readonly meta?: Readonly<Record<string, unknown>>;
}

/**
 * An identity select that follows the client application chosen in the same form (`applicationField`):
 * for a sandbox application it offers only synthetic test identities (`is_synthetic`), the only
 * people a sandbox authenticates; otherwise every identity the relation's candidates allow. The
 * server still refuses or misses anyone else, so this only spares the user a pointless choice.
 */
export function sandboxIdentity<F extends RelationDeclaration>(field: F, applicationField: string): F {
  return {
    ...field,
    ui: { ...field.ui, input: SANDBOX_IDENTITY_FIELD },
    meta: { ...field.meta, sandboxApplication: ref('values', applicationField) },
  };
}
