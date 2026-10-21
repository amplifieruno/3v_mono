import {
  type ErasedResourceHandle,
  type FlowUnknownCheck,
  cond,
  defineResource,
  normalizeEntityRef,
  ref,
} from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { schema } from '../../data/schema';
import {
  INVITATION_STATUSES,
  INVITATION_STATUS_ENUM,
  MEMBER_ROLES,
  MEMBER_ROLE_ENUM,
} from '../../enums/tenancy';
import { invitationTokenBlock } from './invitation-token-block';
import { INVITATION_BINDING, inviteMember, inviteMemberInput } from './invite-member';
import { USER_RESOURCE } from './user';

export const INVITATION_RESOURCE = INVITATION_BINDING;

const roleTexts = {
  label: 'Role',
  doc: { summary: 'The role the invitee gets in this organization on accepting.' },
};

const roleField = f.enum(MEMBER_ROLES, {
  write: 'never',
  texts: roleTexts,
  meta: { enumNamespace: MEMBER_ROLE_ENUM },
});

const statusField = f.enum(INVITATION_STATUSES, {
  write: 'never',
  texts: {
    label: 'Status',
    doc: {
      summary:
        'Pending until the invitee accepts it, an administrator revokes it or it expires; only a pending invitation can be accepted.',
    },
  },
  meta: { enumNamespace: INVITATION_STATUS_ENUM },
});

/** The invitation resource as a read target, without the handle defined below. */
const INVITATION_READ = {
  kind: 'resource',
  ref: normalizeEntityRef(INVITATION_RESOURCE),
} as unknown as ErasedResourceHandle;

/**
 * Check again for a revocation whose answer was lost: the invitation read
 * once more is `revoked` (applied), still `pending` or otherwise (not
 * applied), or unreadable (still unknown).
 */
const revokeApplied: FlowUnknownCheck = async ({ record, data }) => {
  const id = record?.id;
  if (typeof id !== 'string' || id === '') return 'unknown';
  try {
    const { data: row } = await data.one(INVITATION_READ, { id });
    return (row as { readonly status?: unknown }).status === 'revoked' ? 'applied' : 'not-applied';
  } catch {
    return 'unknown';
  }
};

/** Columns of `itap.organization_invitations` the `org_admin` role reads; `mapping.ts` selects these. */
export const invitationFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  email: f.email({
    write: 'never',
    texts: {
      label: 'Email',
      doc: { summary: 'The address the invitation was sent to; the invitee signs up with it.' },
    },
  }),
  role: { ...roleField, ui: { ...roleField.ui, enum: MEMBER_ROLE_ENUM } },
  status: { ...statusField, ui: { ...statusField.ui, enum: INVITATION_STATUS_ENUM } },
  expires_at: f.dateTime({
    write: 'never',
    texts: {
      label: 'Expires',
      doc: {
        summary: 'Seven days after the invitation was created; after it the token is refused.',
      },
    },
  }),
  invited_by: f.relation({
    to: USER_RESOURCE,
    write: 'never',
    open: 'none',
    texts: {
      label: 'Invited by',
      doc: { summary: 'The administrator who created the invitation.' },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Created' }),
};

/**
 * Invitations to join the organization. Created only by the `invite` flow
 * (the `invite_member` action issues the one-time token); a pending one can
 * be revoked. Nothing else about an invitation is edited by hand.
 */
export const organizationInvitation = defineResource(INVITATION_RESOURCE, {
  texts: {
    label: 'Invitation',
    labelPlural: 'Invitations',
    doc: {
      summary:
        'A one-time offer to join the organization, sent to an email address. Accepting it makes the invitee a member.',
    },
  },
  basePath: '/invitations',
  section: NAV_SECTIONS.organization,
  order: 20,
  icon: NAV_ICONS.invitations,
  displayField: 'email',
  // `edit` stays on for the `revoke` flow's status update; the generic Edit is off.
  operations: { create: false, delete: false },
  builtinActions: { edit: false, delete: false },
  data: { provider: 'hasura' },
  fields: invitationFields,
  actions: (r) => ({
    resource: [
      r.action.flow('invite', {
        texts: {
          label: 'Invite member',
          doc: {
            summary:
              'Creates a pending invitation for an email address and shows its one-time token, valid for seven days.',
          },
        },
        icon: NAV_ICONS.invite,
        surfaces: { list: 'regular' },
        form: {
          fields: {
            // The flow's own form check skips the field type's format (`tasks/ui/buro-gaps.md` G11),
            // so the address format is restated as a validator.
            email: f.email({
              required: true,
              validate: schema(inviteMemberInput.shape.email),
              texts: 'Email',
            }),
            role: f.enum(MEMBER_ROLES, {
              required: true,
              default: 'admin',
              texts: roleTexts,
              meta: { enumNamespace: MEMBER_ROLE_ENUM },
            }),
          },
        },
        submit: {
          mutation: inviteMember,
          retry: 'never',
          input: { email: ref('values', 'email'), role: ref('values', 'role') },
        },
        then: {
          open: {
            block: invitationTokenBlock,
            props: {
              token: ref('result', 'token'),
              expiresAt: ref('result', 'expires_at'),
            },
          },
        },
      }),
    ],
    item: [
      r.action.flow('revoke', {
        texts: {
          label: 'Revoke',
          confirm: 'Revoke this invitation? Its token stops working at once.',
          reread: 'The invitation is no longer pending.',
          doc: { summary: 'Withdraws a pending invitation; its token can no longer be accepted.' },
        },
        icon: NAV_ICONS.revoke,
        variant: 'destructive',
        surfaces: { default: false, row: 'auto', show: 'auto' },
        when: cond.equals(ref('record', 'status'), 'pending'),
        confirm: true,
        submit: {
          update: INVITATION_RESOURCE,
          input: { status: 'revoked' },
          reread: { expect: cond.equals(ref('record', 'status'), 'pending') },
          onUnknown: { check: revokeApplied },
        },
      }),
    ],
  }),
  views: {
    list: {
      columns: ['email', 'role', 'status', 'expires_at', 'invited_by', 'created_at'],
      defaultSort: [{ field: 'created_at', direction: 'desc' }],
      search: { fields: ['email'] },
      filters: { fields: ['status'] },
    },
  },
});
