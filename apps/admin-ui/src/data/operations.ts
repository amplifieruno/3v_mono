import type { HasuraOperationRegistry } from '@burojs/hasura';

/**
 * The closed registry of custom GraphQL documents: tracked SQL functions and
 * Hasura actions the table roots cannot express. Keyed by the binding's
 * resource, then by the operation name a `defineQuery` / `defineMutation`
 * names in `binding.operation`; a descriptor never supplies its own document.
 * Modules add their entries here as they ship operations.
 */
export const HASURA_OPERATIONS: HasuraOperationRegistry = {};
