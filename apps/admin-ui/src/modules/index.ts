import { filesModule } from '../fields/open-file';
import { type ConsoleModule, collectOperations, collectTables } from './module';
import { organizationModule } from './organization';
import { overviewModule } from './overview';
import { placesModule } from './places';

/**
 * Every module of the console, in sidebar order. A new module exports one
 * `ConsoleModule` from its `index.ts` and is added here; the registries below
 * and the definition's `use` list (`../app/app-definition.ts`) follow.
 */
export const CONSOLE_MODULES: readonly ConsoleModule[] = [
  overviewModule,
  organizationModule,
  placesModule,
  filesModule,
];

/**
 * The Hasura mapping of every console resource, keyed by its data binding;
 * `tests/integration/schema-mapping.dev.test.ts` checks each entry against the
 * live schema.
 */
export const ITAP_TABLES = collectTables(CONSOLE_MODULES);

/**
 * The closed registry of custom GraphQL documents (tracked SQL functions and
 * Hasura actions): keyed by binding resource, then operation name. A
 * descriptor never supplies its own document.
 */
export const HASURA_OPERATIONS = collectOperations(CONSOLE_MODULES);
