import type { CompatibilityDefinition } from '@burojs/core';
import type { HasuraOperationRegistry } from '@burojs/hasura';
import type { HasuraOperationEntry } from '../data/operations';
import type { HasuraResourceMapping } from '../data/mapping';

/**
 * One functional area of the console, exported as a single object from the
 * module's `index.ts` and listed once in `./index.ts`. The central registries
 * (definition `use` list, Hasura mappings, custom operation documents) are
 * folds over these objects; a module never imports them back.
 */
export interface ConsoleModule {
  /** Contribution id of the module's `use(...)` call; unique across modules. */
  readonly name: string;
  /** Resources, pages, blocks and custom operations it registers. */
  readonly uses: readonly CompatibilityDefinition[];
  /** Hasura mapping per resource binding (`hasuraTable(...)`). */
  readonly tables?: Readonly<Record<string, HasuraResourceMapping>>;
  /** GraphQL documents of its custom operations, each declared beside its `defineQuery` / `defineMutation`. */
  readonly operations?: readonly HasuraOperationEntry[];
}

function addUnique<T>(target: Record<string, T>, key: string, value: T, what: string): void {
  if (Object.prototype.hasOwnProperty.call(target, key)) throw new Error(`Duplicate ${what} '${key}'.`);
  target[key] = value;
}

/** Every module's table mappings in one record; a binding declared twice throws. */
export function collectTables(
  modules: readonly ConsoleModule[],
): Readonly<Record<string, HasuraResourceMapping>> {
  const out: Record<string, HasuraResourceMapping> = {};
  for (const mod of modules) {
    for (const [binding, mapping] of Object.entries(mod.tables ?? {})) {
      addUnique(out, binding, mapping, 'Hasura mapping');
    }
  }
  return out;
}

/** The closed custom-operation registry of all modules; an operation declared twice throws. */
export function collectOperations(modules: readonly ConsoleModule[]): HasuraOperationRegistry {
  const out: Record<string, Record<string, HasuraOperationEntry['document']>> = {};
  for (const mod of modules) {
    for (const entry of mod.operations ?? []) {
      const byName = (out[entry.binding.resource] ??= {});
      addUnique(byName, entry.binding.operation, entry.document, `operation ${entry.binding.resource}`);
    }
  }
  return out;
}
