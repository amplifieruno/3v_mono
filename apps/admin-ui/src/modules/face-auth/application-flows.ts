import { type FlowConfig, type FlowUnknownCheck, cond, ref } from '@burojs/core';
import { NAV_ICONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { CLIENT_APPLICATION_RESOURCE } from '../../data/resource-names';
import { fieldApplied } from '../../data/status-applied';
import { deleteClientApplication, setClientApplicationStatus } from './application-ops';

const status = ref('record', 'status');
const statusIs = (value: string) => fieldApplied(CLIENT_APPLICATION_RESOURCE, 'status', value);

/*
 * The status flows confirm, then set the status (`update_client_applications_by_pk`). They are
 * launched from the record's "More" menu, where a confirm-only flow keeps its toast (G72 measured
 * in phase 10); the new status shows on the page in any case. Revoked is terminal: the guard
 * refuses any change back (`client_application_revoked`, mapped).
 */

/** "Suspend" on an active application: every request is refused until it is reactivated. */
export const suspendFlow = {
  texts: {
    label: 'Suspend',
    confirm:
      'Suspend this application? Every request it sends is refused (application inactive) until it is reactivated. Its keys, bindings and history are kept.',
    notify: '{{code}} is suspended.',
    doc: {
      summary: 'Stops the application for now: every request is refused until it is reactivated. Nothing else changes.',
    },
  },
  icon: NAV_ICONS.suspendApplication,
  surfaces: { default: 'menu', show: 'menu' },
  when: cond.equals(status, 'active'),
  confirm: true,
  submit: {
    mutation: setClientApplicationStatus,
    // Idempotent: setting the same status again changes nothing.
    retry: 'after-auth-refresh',
    input: { applicationId: ref('record', 'id'), status: 'suspended' },
    onUnknown: { check: statusIs('suspended') },
  },
  then: { notify: { params: { code: ref('result', 'code') } } },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;

/** "Reactivate" on a suspended application: its requests are accepted again. */
export const reactivateFlow = {
  texts: {
    label: 'Reactivate',
    confirm: 'Reactivate this application? Its requests are accepted again with its current keys and bindings.',
    notify: '{{code}} is active again.',
    doc: { summary: 'Ends a suspension: the application’s requests are accepted again. A revoked application cannot be reactivated.' },
  },
  icon: NAV_ICONS.reactivateApplication,
  surfaces: { default: 'menu', show: 'menu' },
  when: cond.equals(status, 'suspended'),
  confirm: true,
  submit: {
    mutation: setClientApplicationStatus,
    retry: 'after-auth-refresh',
    input: { applicationId: ref('record', 'id'), status: 'active' },
    onUnknown: { check: statusIs('active') },
  },
  then: { notify: { params: { code: ref('result', 'code') } } },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;

/** "Revoke" on an application not yet revoked: retired for good. */
export const revokeFlow = {
  texts: {
    label: 'Revoke',
    confirm:
      'Revoke this application for good? Every request it sends is refused from now on and it can never be reactivated: an integration needs a new application. Its sessions and attempts stay as history.',
    notify: '{{code}} is revoked.',
    doc: {
      summary:
        'Retires the application for good: every request is refused and it can never be reactivated. Use it for an integration that is gone or compromised; suspend instead to pause it.',
    },
  },
  icon: NAV_ICONS.revokeApplication,
  variant: 'destructive',
  surfaces: { default: 'menu', show: 'menu' },
  when: cond.in(status, ['active', 'suspended']),
  confirm: true,
  submit: {
    mutation: setClientApplicationStatus,
    retry: 'after-auth-refresh',
    input: { applicationId: ref('record', 'id'), status: 'revoked' },
    onUnknown: { check: statusIs('revoked') },
  },
  then: { notify: { params: { code: ref('result', 'code') } } },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;

/** Check again after a lost "Delete": applied when the application is gone. */
export const applicationDeleted: FlowUnknownCheck = async ({ record, data }) => {
  const id = record?.id;
  if (typeof id !== 'string' || id === '') return 'unknown';
  try {
    const { data: row } = await data.one(resourceByName(CLIENT_APPLICATION_RESOURCE) as never, { id } as never);
    return row === null || row === undefined ? 'applied' : 'not-applied';
  } catch {
    return 'unknown';
  }
};

/**
 * Replaces the built-in Delete: an application that has authenticated anyone keeps its sessions
 * and attempts as history, and the database's refusal reads as a sentence (G54): revoke it instead.
 */
export const deleteFlow = {
  texts: {
    label: 'Delete',
    confirm:
      'Delete this application with its keys and bindings? An application that has sessions or attempts cannot be deleted: revoke it instead.',
    notify: 'Application deleted.',
    doc: {
      summary:
        'Deletes an application that never authenticated anyone, with its keys and bindings. One with sessions or attempts is refused with the reason: revoke it instead.',
    },
  },
  icon: 'Trash2',
  variant: 'destructive',
  order: 1000,
  surfaces: { default: 'menu' },
  confirm: true,
  submit: {
    mutation: deleteClientApplication,
    retry: 'never',
    input: { applicationId: ref('record', 'id') },
    onUnknown: { check: applicationDeleted },
  },
  then: { notify: true, redirect: { resource: CLIENT_APPLICATION_RESOURCE, action: 'list' } },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;
