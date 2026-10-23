import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import { CLIENT_APPLICATION_RESOURCE } from '../../data/resource-names';
import type { ConsoleModule } from '../module';
import { clientApplication } from './application';
import { clientApplicationFields } from './application-fields';
import { deleteApplicationOperation, deleteClientApplication, setApplicationStatusOperation, setClientApplicationStatus } from './application-ops';
import { BIND_MUTATIONS, BIND_OPERATIONS } from './binding-ops';
import { BINDINGS } from './binding-targets';
import { BINDING_RESOURCES, bindingFields } from './bindings';

/** Each junction resource's mapping (`client_application_<kind>s`). */
const bindingTables = Object.fromEntries(
  BINDINGS.map((spec) => [spec.resource, hasuraTable(spec.table, { selectFields: selectFieldsOf(bindingFields(spec.kind)) })]),
);

/**
 * Face authentication: client applications of the face authentication API with their bindings
 * (segments, facilities, access points, modes, attributes), thresholds, liveness and work
 * schedules, suspended, reactivated or revoked (terminal); sandbox applications bind no places.
 * Keys, sessions, attempts, review and the console tester come with phase 11 tasks 2 and 3.
 */
export const faceAuthModule = {
  name: 'face-auth-module',
  uses: [clientApplication, ...BINDING_RESOURCES, setClientApplicationStatus, deleteClientApplication, ...Object.values(BIND_MUTATIONS)],
  tables: {
    [CLIENT_APPLICATION_RESOURCE]: hasuraTable('client_applications', { selectFields: selectFieldsOf(clientApplicationFields) }),
    ...bindingTables,
  },
  operations: [setApplicationStatusOperation, deleteApplicationOperation, ...BIND_OPERATIONS],
} as const satisfies ConsoleModule;
