import type { HasuraCustomOperation } from '@burojs/hasura';
import type { ActionRefusalReader } from './action-refusals';
import { HASURA_PROVIDER } from './provider-name';

/** Where a custom operation is bound: the registry key (resource) and the operation name. */
export interface HasuraOperationBinding {
  readonly provider: typeof HASURA_PROVIDER;
  readonly resource: string;
  readonly operation: string;
}

/**
 * One custom GraphQL operation: its binding (handed to `defineQuery` /
 * `defineMutation`) and its document (collected into the provider's closed
 * registry by `../modules/module.ts`). Declared once, beside the descriptor,
 * so the two cannot drift apart.
 */
export interface HasuraOperationEntry {
  readonly binding: HasuraOperationBinding;
  readonly document: HasuraCustomOperation;
  /** How the action's definite refusals read on the flow form (`./action-refusals.ts`), if it has any. */
  readonly refusals?: ActionRefusalReader;
}

/** A custom operation under `resource`.`operation` with its GraphQL document. */
export function hasuraOperation(
  resource: string,
  operation: string,
  document: HasuraCustomOperation,
  refusals?: ActionRefusalReader,
): HasuraOperationEntry {
  return {
    binding: { provider: HASURA_PROVIDER, resource, operation },
    document,
    ...(refusals === undefined ? {} : { refusals }),
  };
}

/** The named root field of a GraphQL answer, or `undefined`. */
export function rootOf(data: unknown, field: string): unknown {
  return typeof data === 'object' && data !== null
    ? (data as Readonly<Record<string, unknown>>)[field]
    : undefined;
}
