import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import {
  AUTHENTICATION_ATTEMPT_RESOURCE,
  AUTHENTICATION_SESSION_RESOURCE,
  AUTH_TESTER_RESOURCE,
  CLIENT_APPLICATION_KEY_RESOURCE,
  CLIENT_APPLICATION_RESOURCE,
} from '../../data/resource-names';
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
import { authenticationAttempt } from './attempt';
import { authenticationAttemptFields } from './attempt-fields';
import { authDecisionBlock } from './decision-block';
import { reviewAttemptOperation, reviewAuthenticationAttempt } from './review-ops';
import { authenticationSession } from './session';
import { authenticationSessionFields } from './session-fields';
import { authTester, authTesterBlock, authTesterFields, authTesterPage } from './tester';
import { authenticateFace, authenticateOperation } from './tester-ops';

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
 * API keys rotated (secret shown once) and revoked; authentication sessions and attempts (append-only
 * logs) with the review of pending partial matches; the "Authenticate a face" console tester.
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
    authenticationSession,
    authenticationAttempt,
    reviewAuthenticationAttempt,
    authTester,
    authTesterBlock,
    authTesterPage,
    authDecisionBlock,
    authenticateFace,
  ],
  tables: {
    [CLIENT_APPLICATION_RESOURCE]: hasuraTable('client_applications', { selectFields: selectFieldsOf(clientApplicationFields) }),
    ...bindingTables,
    [CLIENT_APPLICATION_KEY_RESOURCE]: hasuraTable('client_application_keys', { selectFields: selectFieldsOf(clientKeyFields) }),
    // Append-only logs: keyset paging, no count on every page.
    [AUTHENTICATION_SESSION_RESOURCE]: hasuraTable('authentication_sessions', {
      selectFields: selectFieldsOf(authenticationSessionFields),
      orderByField: 'created_at',
      noAggregate: true,
    }),
    [AUTHENTICATION_ATTEMPT_RESOURCE]: hasuraTable('authentication_attempts', {
      selectFields: selectFieldsOf(authenticationAttemptFields),
      orderByField: 'attempted_at',
      noAggregate: true,
    }),
    [AUTH_TESTER_RESOURCE]: hasuraTable('organization_settings', { selectFields: selectFieldsOf(authTesterFields), pkField: 'organization_id' }),
  },
  operations: [
    setApplicationStatusOperation,
    deleteApplicationOperation,
    rotateKeyOperation,
    revokeKeyOperation,
    ...BIND_OPERATIONS,
    reviewAttemptOperation,
    authenticateOperation,
  ],
} as const satisfies ConsoleModule;
