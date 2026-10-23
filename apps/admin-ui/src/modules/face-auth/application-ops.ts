import { defineMutation } from '@burojs/core';
import { z } from 'zod';
import { type HasuraOperationEntry, hasuraOperation, rootOf } from '../../data/operations';
import { CLIENT_APPLICATION_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { type SqlRefusalText, sqlRefusals } from '../../data/sql-refusals';
import { CLIENT_APPLICATION_STATUSES } from '../../enums/face-auth';

/** The registry key the face authentication operations are bound under. */
export const FACE_AUTH_BINDING = 'face-auth';

const NOTHING = ' Nothing was changed.';
const KEEP = ' Revoke the application instead: it refuses every request from then on and keeps its history. Nothing was deleted.';

/** What the database refuses on a status change (`itap.guard_client_application`). */
export const STATUS_REFUSALS: Readonly<Record<string, SqlRefusalText>> = {
  client_application_revoked: 'The application is revoked, and a revoked application can never be reactivated: register a new one.' + NOTHING,
  client_application_sandbox_immutable: 'Whether an application is a sandbox never changes.' + NOTHING,
};

/**
 * Why the database refuses to delete an application: sessions and attempts keep it as their
 * history (NO ACTION foreign keys). Keys and bindings go with it.
 */
export const DELETE_APPLICATION_REFUSALS: Readonly<Record<string, SqlRefusalText>> = {
  authentication_sessions_application_fkey: 'The application has authentication sessions, and they are kept as history.' + KEEP,
  authentication_attempts_application_fkey: 'The application has authentication attempts, and they are kept as history.' + KEEP,
};

export const setStatusInput = z.object({ applicationId: z.string().uuid(), status: z.enum(CLIENT_APPLICATION_STATUSES) });
export const deleteApplicationInput = z.object({ applicationId: z.string().uuid() });

const statusRow = z.object({ id: z.string(), code: z.string(), status: z.string() });

export const setApplicationStatusOperation: HasuraOperationEntry = hasuraOperation(
  FACE_AUTH_BINDING,
  'setClientApplicationStatus',
  {
    kind: 'mutation',
    document: `mutation SetClientApplicationStatus($id: uuid!, $status: client_application_statuses_enum!) {
  update_client_applications_by_pk(pk_columns: { id: $id }, _set: { status: $status }) { id code status }
}`,
    variables: (input) => {
      const { applicationId, status } = input as z.infer<typeof setStatusInput>;
      return { id: applicationId, status };
    },
    mapResult: (data) => rootOf(data, 'update_client_applications_by_pk') ?? null,
  },
  sqlRefusals(STATUS_REFUSALS),
);

/** Suspends, reactivates or revokes an application (`null`: it no longer exists). */
export const setClientApplicationStatus = defineMutation('itap:set-client-application-status', {
  binding: setApplicationStatusOperation.binding,
  input: schema(setStatusInput),
  output: schema(statusRow.nullable()),
  effects: [{ resource: CLIENT_APPLICATION_RESOURCE }],
});

export const deleteApplicationOperation: HasuraOperationEntry = hasuraOperation(
  FACE_AUTH_BINDING,
  'deleteClientApplication',
  {
    kind: 'mutation',
    document: `mutation DeleteClientApplication($id: uuid!) {
  delete_client_applications_by_pk(id: $id) { id }
}`,
    variables: (input) => ({ id: (input as z.infer<typeof deleteApplicationInput>).applicationId }),
    mapResult: (data) => rootOf(data, 'delete_client_applications_by_pk') ?? null,
  },
  sqlRefusals(DELETE_APPLICATION_REFUSALS),
);

/** Deletes an application that never authenticated anyone; the database refuses any other (revoke it). */
export const deleteClientApplication = defineMutation('itap:delete-client-application', {
  binding: deleteApplicationOperation.binding,
  input: schema(deleteApplicationInput),
  output: schema(z.object({ id: z.string() }).nullable()),
  effects: [{ resource: CLIENT_APPLICATION_RESOURCE }],
});
