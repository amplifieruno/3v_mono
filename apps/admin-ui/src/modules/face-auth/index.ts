import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import { CLIENT_APPLICATION_KEY_RESOURCE, CLIENT_APPLICATION_RESOURCE } from '../../data/resource-names';
import type { ConsoleModule } from '../module';
import { clientApplication } from './application';
import { clientApplicationFields } from './application-fields';
import { deleteApplicationOperation, deleteClientApplication, setApplicationStatusOperation, setClientApplicationStatus } from './application-ops';
import { BIND_MUTATIONS, BIND_OPERATIONS } from './binding-ops';
import { BINDINGS } from './binding-targets';
import { BINDING_RESOURCES, bindingFields } from './bindings';
import { clientApplicationKey, clientKeyFields } from './key';
import { revokeClientKey, revokeKeyOperation, rotateClientKey, rotateKeyOperation } from './key-ops';
import { clientKeySecretBlock } from './key-secret-block';

/** Each junction resource's mapping (`client_application_<kind>s`). */
const bindingTables = Object.fromEntries(
  // `application { status }`: the binding rules read it (no removal on a revoked application, G75).
  BINDINGS.map((spec) => [
    spec.resource,
    hasuraTable(spec.table, { selectFields: [...selectFieldsOf(bindingFields(spec.kind)), 'application { status }'] }),
  ]),
);

/**
 * Face authentication: client applications of the face authentication API with their bindings
 * (segments, facilities, access points, modes, attributes), thresholds, liveness and work
 * schedules, suspended, reactivated or revoked (terminal); sandbox applications bind no places;
 * API keys rotated (secret shown once) and revoked. Sessions, attempts, review and the console
 * tester come with phase 11 task 3.
 */
export const faceAuthModule = {
  name: 'face-auth-module',
  uses: [
    clientApplication,
    ...BINDING_RESOURCES,
    clientApplicationKey,
    clientKeySecretBlock,
    setClientApplicationStatus,
    deleteClientApplication,
    rotateClientKey,
    revokeClientKey,
    ...Object.values(BIND_MUTATIONS),
  ],
  tables: {
    [CLIENT_APPLICATION_RESOURCE]: hasuraTable('client_applications', { selectFields: selectFieldsOf(clientApplicationFields) }),
    ...bindingTables,
    [CLIENT_APPLICATION_KEY_RESOURCE]: hasuraTable('client_application_keys', { selectFields: selectFieldsOf(clientKeyFields) }),
  },
  operations: [setApplicationStatusOperation, deleteApplicationOperation, rotateKeyOperation, revokeKeyOperation, ...BIND_OPERATIONS],
} as const satisfies ConsoleModule;
