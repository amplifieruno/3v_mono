import { type Rule, cond, defineResource, ref } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { IDENTITY_RESOURCE, USER_RESOURCE, VERIFICATION_REQUEST_RESOURCE } from '../../data/resource-names';
import { fieldApplied } from '../../data/status-applied';
import { enumField } from '../../enums/field';
import { VERIFICATION_STATUSES, VERIFICATION_STATUS_ENUM } from '../../enums/identity-governance';
import { recordDate } from './record-date';
import { approveVerification, rejectVerification } from './verification-ops';
import { dateTime } from '../../fields/date-time';

/** Columns of `itap.verification_requests` the `org_admin` role reads (`organization_id` left out). */
export const verificationRequestFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  identity_id: f.relation({
    to: IDENTITY_RESOURCE,
    required: true,
    write: 'create',
    open: 'page',
    texts: {
      label: 'Identity',
      doc: { summary: 'The identity to confirm. An unverified identity shows Pending verification while the request is open.' },
    },
  }),
  status: enumField(VERIFICATION_STATUSES, VERIFICATION_STATUS_ENUM, {
    write: 'never',
    in: ['list', 'show'],
    texts: {
      label: 'Status',
      doc: { summary: 'Pending until a reviewer approves or rejects it; cancelled when the identity is merged away.' },
    },
  }),
  assigned_to: f.relation({
    to: USER_RESOURCE,
    nullable: true,
    open: 'none',
    texts: { label: 'Reviewer', doc: { summary: 'The member asked to decide; any administrator may decide.' } },
  }),
  reason: f.text({
    nullable: true,
    texts: {
      label: 'Reason',
      doc: { summary: 'Why verification is asked for; the decision’s reason replaces it when one is given.' },
    },
  }),
  evidence: f.json({
    write: 'never',
    in: ['show'],
    texts: { label: 'Evidence', doc: { summary: 'What the request was raised from, such as a recognition match, recorded by the platform.' } },
  }),
  requested_by: f.relation({
    to: USER_RESOURCE,
    system: true,
    in: ['list', 'show'],
    nullable: true,
    open: 'none',
    texts: { label: 'Requested by', doc: { summary: 'The member who asked; empty when the platform raised it.' } },
  }),
  decided_by: f.relation({
    to: USER_RESOURCE,
    system: true,
    in: ['list', 'show'],
    nullable: true,
    open: 'none',
    texts: { label: 'Decided by', doc: { summary: 'The member who approved or rejected the request.' } },
  }),
  decided_at: dateTime({
    system: true,
    in: ['list', 'show'],
    texts: { label: 'Decided', doc: { summary: 'When the request was approved, rejected or cancelled.' } },
  }),
  created_at: f.dateTime({ system: true, in: ['list', 'show'], texts: { label: 'Requested', doc: { summary: 'When verification was asked for.' } } }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: [] }),
};

/** The decision's reason: optional on approval, required on rejection. */
const reasonField = (required: boolean) =>
  f.text({
    required,
    nullable: !required,
    texts: {
      label: 'Reason',
      doc: {
        summary: required
          ? 'Why the identity could not be confirmed; kept on the request and in the audit log.'
          : 'How the identity was confirmed (for example, ID card checked at reception); kept on the request and in the audit log.',
      },
    },
  });

const approveFields = { reason: reasonField(false) };
const rejectFields = { reason: reasonField(true) };

const pending = cond.equals(ref('record', 'status'), 'pending');

/** A decided request is a record: it is not edited any more (the update permission needs `pending`). */
const DECIDED_RULES: Rule[] = [
  {
    target: { kind: 'action', name: 'edit' },
    deny: 'run',
    when: (ctx) => (ctx.record as { readonly status?: unknown } | undefined)?.status !== 'pending',
    fallback: 'disable',
    reason: 'The request was decided: it is kept as it is.',
  },
];

/**
 * Verification requests: an administrator confirms who an identity is ("Approve", the identity
 * becomes verified) or says it could not be confirmed ("Reject" with a reason: a pending
 * verification identity goes back to unverified, any other keeps its status). Asked for from the
 * identity's Verification tab or here; never deleted.
 */
export const verificationRequest = defineResource(VERIFICATION_REQUEST_RESOURCE, {
  texts: {
    label: 'Verification request',
    labelPlural: 'Verification requests',
    doc: {
      summary:
        'A request to confirm who an identity is, for example by checking an ID card against its photos. Approving makes the identity verified; rejecting sends a pending verification identity back to unverified.',
    },
  },
  basePath: '/verification-requests',
  section: NAV_SECTIONS.people,
  order: 35,
  icon: NAV_ICONS.verification,
  displayField: 'created_at',
  recordTitle: (record) => recordDate('Verification request of', record.created_at),
  data: { provider: 'hasura' },
  prefill: { fromQuery: ['identity_id'] },
  operations: { delete: false },
  builtinActions: { delete: false },
  fields: verificationRequestFields,
  rules: DECIDED_RULES,
  actions: (r) => ({
    item: [
      r.action.flow('approve', {
        texts: {
          label: 'Approve',
          confirm: 'Confirm who this identity is? It becomes verified.',
          notify: 'Identity verified.',
          doc: { summary: 'Confirms the identity: it becomes verified, and the decision is recorded with your name.' },
        },
        icon: NAV_ICONS.approve,
        surfaces: { default: 'menu', show: 'auto' },
        when: pending,
        confirm: true,
        form: { fields: approveFields, initial: { reason: { kind: 'literal', value: null } } },
        submit: {
          mutation: approveVerification,
          retry: 'never',
          input: { requestId: ref('record', 'id'), reason: ref('values', 'reason') },
          onUnknown: { check: fieldApplied(VERIFICATION_REQUEST_RESOURCE, 'status', 'approved') },
        },
        then: { notify: true },
      }),
      r.action.flow('reject', {
        texts: {
          label: 'Reject',
          notify: 'Request rejected.',
          doc: {
            summary:
              'Records that the identity could not be confirmed, with the reason. A Pending verification identity goes back to unverified; any other status (verified, suspended, archived) is kept.',
          },
        },
        icon: NAV_ICONS.reject,
        variant: 'destructive',
        surfaces: { default: 'menu', show: 'auto' },
        when: pending,
        form: { fields: rejectFields, initial: { reason: { kind: 'literal', value: '' } } },
        submit: {
          mutation: rejectVerification,
          retry: 'never',
          input: { requestId: ref('record', 'id'), reason: ref('values', 'reason') },
          onUnknown: { check: fieldApplied(VERIFICATION_REQUEST_RESOURCE, 'status', 'rejected') },
        },
        then: { notify: true },
      }),
    ],
  }),
  views: {
    list: {
      columns: ['identity_id', 'status', 'assigned_to', 'requested_by', 'created_at', 'decided_at'],
      defaultSort: [{ field: 'created_at', direction: 'desc' }],
      filters: { fields: ['status', 'assigned_to', 'created_at'] },
      savedViews: [{ id: 'pending', texts: 'Pending', state: { filters: [{ field: 'status', op: 'eq', value: 'pending' }] } }],
    },
    show: {
      header: (l) => [l.grid(['status', 'created_at', 'decided_at'])],
      body: (l) => [l.grid(['identity_id', 'assigned_to']), 'reason', l.grid(['requested_by', 'decided_by']), 'evidence'],
    },
    create: { body: () => ['identity_id', 'assigned_to', 'reason'] },
    edit: { body: () => ['identity_id', 'assigned_to', 'reason'] },
  },
});
