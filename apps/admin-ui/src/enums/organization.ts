import { defineEnum } from '@burojs/core';
import { enumValues } from './values';

/* Organization enums (companies); values are the rows of the Hasura enum tables in `ORGANIZATION_ENUM_TABLES`. */

export const COMPANY_KIND_ENUM = 'company_kind';
export const COMPANY_STATUS_ENUM = 'company_status';

export const COMPANY_KINDS = [
  'tenant',
  'contractor_vendor',
  'service_provider',
  'visitor_org',
] as const;
export const COMPANY_STATUSES = ['active', 'inactive'] as const;

export const companyKindEnum = defineEnum({
  name: COMPANY_KIND_ENUM,
  values: enumValues(COMPANY_KINDS, {
    tenant: 'info',
    contractor_vendor: 'warning',
    service_provider: 'default',
    visitor_org: 'secondary',
  }),
  texts: {
    tenant: { label: 'Tenant', doc: { summary: 'Rents space in the business center.' } },
    contractor_vendor: {
      label: 'Contractor or vendor',
      doc: { summary: 'Works on site for a limited time: maintenance, construction, deliveries.' },
    },
    service_provider: {
      label: 'Service provider',
      doc: { summary: 'Runs a service of the building itself, such as security or cleaning.' },
    },
    visitor_org: {
      label: 'Visitor organization',
      doc: { summary: 'The organization visitors come from; used to group visits.' },
    },
  },
});

export const companyStatusEnum = defineEnum({
  name: COMPANY_STATUS_ENUM,
  values: enumValues(COMPANY_STATUSES, { active: 'success', inactive: 'secondary' }),
  texts: {
    active: 'Active',
    inactive: {
      label: 'Inactive',
      doc: { summary: 'No longer working with the organization; kept for its people and history.' },
    },
  },
});

/** Each organization enum by the Hasura enum table (GraphQL `custom_name`) holding its values. */
export const ORGANIZATION_ENUM_TABLES: Readonly<Record<string, string>> = {
  [COMPANY_KIND_ENUM]: 'company_kinds',
  [COMPANY_STATUS_ENUM]: 'company_statuses',
};
