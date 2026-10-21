import { defineEnum } from '@burojs/core';
import { enumValues } from './values';

/*
 * Tenancy enums. Values are exactly the rows of the Hasura enum tables named
 * in `TENANCY_ENUM_TABLES` (checked live by
 * `tests/integration/schema-mapping.dev.test.ts`); colours are the kit's badge
 * variants (`secondary` stands for neutral).
 */

export const ORGANIZATION_STATUS_ENUM = 'organization_status';
export const MEMBER_ROLE_ENUM = 'member_role';
export const MEMBER_STATUS_ENUM = 'member_status';
export const INVITATION_STATUS_ENUM = 'invitation_status';

export const ORGANIZATION_STATUSES = ['active', 'suspended'] as const;
export const MEMBER_ROLES = ['admin'] as const;
export const MEMBER_STATUSES = ['active', 'suspended', 'deactivated'] as const;
export const INVITATION_STATUSES = ['pending', 'accepted', 'revoked', 'expired'] as const;

export const organizationStatusEnum = defineEnum({
  name: ORGANIZATION_STATUS_ENUM,
  values: enumValues(ORGANIZATION_STATUSES, { active: 'success', suspended: 'warning' }),
  texts: {
    active: 'Active',
    suspended: {
      label: 'Suspended',
      doc: { summary: 'Members can no longer switch into the organization; its data is kept.' },
    },
  },
});

export const memberRoleEnum = defineEnum({
  name: MEMBER_ROLE_ENUM,
  values: enumValues(MEMBER_ROLES, { admin: 'default' }),
  texts: {
    admin: {
      label: 'Administrator',
      doc: { summary: 'Full access to the organization (the only role the data layer has today).' },
    },
  },
});

export const memberStatusEnum = defineEnum({
  name: MEMBER_STATUS_ENUM,
  values: enumValues(MEMBER_STATUSES, {
    active: 'success',
    suspended: 'warning',
    deactivated: 'secondary',
  }),
  texts: {
    active: 'Active',
    suspended: {
      label: 'Suspended',
      doc: { summary: 'Temporarily blocked: the member cannot switch into the organization.' },
    },
    deactivated: {
      label: 'Deactivated',
      doc: { summary: 'Removed from the organization; the row stays for history and audit.' },
    },
  },
});

export const invitationStatusEnum = defineEnum({
  name: INVITATION_STATUS_ENUM,
  values: enumValues(INVITATION_STATUSES, {
    pending: 'info',
    accepted: 'success',
    revoked: 'secondary',
    expired: 'warning',
  }),
  texts: {
    pending: { label: 'Pending', doc: { summary: 'Sent and waiting for the invitee to accept.' } },
    accepted: 'Accepted',
    revoked: {
      label: 'Revoked',
      doc: { summary: 'Withdrawn by an administrator before acceptance.' },
    },
    expired: { label: 'Expired', doc: { summary: 'Not accepted before its expiry time.' } },
  },
});

/** Each tenancy enum by the Hasura enum table (GraphQL `custom_name`) holding its values. */
export const TENANCY_ENUM_TABLES: Readonly<Record<string, string>> = {
  [ORGANIZATION_STATUS_ENUM]: 'organization_statuses',
  [MEMBER_ROLE_ENUM]: 'member_roles',
  [MEMBER_STATUS_ENUM]: 'member_statuses',
  [INVITATION_STATUS_ENUM]: 'invitation_statuses',
};
