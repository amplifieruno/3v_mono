import { defineEnum } from '@burojs/core';
import { enumValues } from './values';

/* Organization enums (companies, custom attribute definitions); values are the rows of the Hasura enum tables in `ORGANIZATION_ENUM_TABLES`. */

export const COMPANY_KIND_ENUM = 'company_kind';
export const COMPANY_STATUS_ENUM = 'company_status';
export const CUSTOM_ATTRIBUTE_ENTITY_ENUM = 'custom_attribute_entity';
export const CUSTOM_ATTRIBUTE_TYPE_ENUM = 'custom_attribute_type';

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

export const CUSTOM_ATTRIBUTE_ENTITIES = ['profile', 'identity', 'facility', 'device'] as const;
export const CUSTOM_ATTRIBUTE_TYPES = ['string', 'number', 'boolean', 'date', 'enum'] as const;

export const customAttributeEntityEnum = defineEnum({
  name: CUSTOM_ATTRIBUTE_ENTITY_ENUM,
  values: enumValues(CUSTOM_ATTRIBUTE_ENTITIES, {
    profile: 'info',
    identity: 'secondary',
    facility: 'default',
    device: 'default',
  }),
  texts: { profile: 'Profile', identity: 'Identity', facility: 'Facility', device: 'Device' },
});

export const customAttributeTypeEnum = defineEnum({
  name: CUSTOM_ATTRIBUTE_TYPE_ENUM,
  values: enumValues(CUSTOM_ATTRIBUTE_TYPES, {
    string: 'secondary',
    number: 'secondary',
    boolean: 'secondary',
    date: 'secondary',
    enum: 'info',
  }),
  texts: {
    string: 'Text',
    number: 'Number',
    boolean: { label: 'Yes / no', doc: { summary: 'A checkbox: true or false.' } },
    date: { label: 'Date', doc: { summary: 'A calendar date, stored as YYYY-MM-DD.' } },
    enum: {
      label: 'Select',
      doc: { summary: 'One value picked from the attribute’s list of options.' },
    },
  },
});

/** Each organization enum by the Hasura enum table (GraphQL `custom_name`) holding its values. */
export const ORGANIZATION_ENUM_TABLES: Readonly<Record<string, string>> = {
  [COMPANY_KIND_ENUM]: 'company_kinds',
  [COMPANY_STATUS_ENUM]: 'company_statuses',
  [CUSTOM_ATTRIBUTE_ENTITY_ENUM]: 'custom_attribute_entities',
  [CUSTOM_ATTRIBUTE_TYPE_ENUM]: 'custom_attribute_types',
};
