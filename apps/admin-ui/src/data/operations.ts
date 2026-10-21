import type { HasuraCustomOperation } from '@burojs/hasura';
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
}

/** A custom operation under `resource`.`operation` with its GraphQL document. */
export function hasuraOperation(
  resource: string,
  operation: string,
  document: HasuraCustomOperation,
): HasuraOperationEntry {
  return { binding: { provider: HASURA_PROVIDER, resource, operation }, document };
}

/** The named root field of a GraphQL answer, or `undefined`. */
export function rootOf(data: unknown, field: string): unknown {
  return typeof data === 'object' && data !== null
    ? (data as Readonly<Record<string, unknown>>)[field]
    : undefined;
}
