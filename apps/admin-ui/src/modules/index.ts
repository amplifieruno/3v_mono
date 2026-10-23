import { filesModule } from '../fields/open-file';
import { accessModule } from './access';
import { analyticsModule } from './analytics';
import { devicesModule } from './devices';
import { faceAuthModule } from './face-auth';
import { type ConsoleModule, collectOperations, collectRefusals, collectTables } from './module';
import { monitoringModule } from './monitoring';
import { notificationsModule } from './notifications';
import { organizationModule } from './organization';
import { peopleModule } from './people';
import { overviewModule } from './overview';
import { placesModule } from './places';
import { searchModule } from './search';
import { segmentsModule } from './segments';

/**
 * Every module of the console, in sidebar order. A new module exports one
 * `ConsoleModule` from its `index.ts` and is added here; the registries below
 * and the definition's `use` list (`../app/app-definition.ts`) follow.
 */
export const CONSOLE_MODULES: readonly ConsoleModule[] = [
  overviewModule,
  organizationModule,
  placesModule,
  devicesModule,
  peopleModule,
  searchModule,
  monitoringModule,
  notificationsModule,
  segmentsModule,
  analyticsModule,
  accessModule,
  faceAuthModule,
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

/** How the actions' definite refusals read on flow forms (`../data/action-refusals.ts`). */
export const ACTION_REFUSALS = collectRefusals(CONSOLE_MODULES);
