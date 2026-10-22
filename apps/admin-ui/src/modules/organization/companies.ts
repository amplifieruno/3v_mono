import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { z } from 'zod';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { enumField } from '../../enums/field';
import {
  COMPANY_KINDS,
  COMPANY_KIND_ENUM,
  COMPANY_STATUSES,
  COMPANY_STATUS_ENUM,
} from '../../enums/organization';

export const COMPANY_RESOURCE = 'company';

const EMAIL = z.string().email();

/** The record form runs `validate` only, not the field's format (`tasks/ui/buro-gaps.md` G14). */
const checkEmail = (value: unknown): string | null =>
  value === null || value === undefined || value === '' || EMAIL.safeParse(value).success
    ? null
    : 'Enter a valid email address.';

/** Columns of `itap.companies` the `org_admin` role reads; the module's `index.ts` mapping selects these. */
export const companyFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  name: f.string({ required: true, texts: 'Name' }),
  kind: enumField(COMPANY_KINDS, COMPANY_KIND_ENUM, {
    required: true,
    default: 'tenant',
    texts: {
      label: 'Kind',
      doc: {
        summary:
          'What the company is to the business center: a tenant, a contractor or vendor, a service provider of the building, or the organization visitors come from.',
      },
    },
  }),
  status: enumField(COMPANY_STATUSES, COMPANY_STATUS_ENUM, {
    required: true,
    default: 'active',
    texts: {
      label: 'Status',
      doc: {
        summary:
          'An inactive company keeps its people and history; set it inactive instead of deleting a company people still belong to.',
      },
    },
  }),
  suite: f.string({
    nullable: true,
    texts: {
      label: 'Suite',
      doc: { summary: 'The office or unit a tenant occupies, for example `1201` or `B-12`.' },
    },
  }),
  contact_email: f.email({ nullable: true, validate: checkEmail, texts: 'Contact email' }),
  contact_phone: f.string({ nullable: true, texts: 'Contact phone' }),
  cost_center: f.string({
    nullable: true,
    texts: {
      label: 'Cost center',
      doc: {
        summary:
          'The cost center code contractors and vendors are billed under (from the ERP), for example `FM-200`.',
      },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Created' }),
  updated_at: f.dateTime({ system: true, texts: 'Updated' }),
};

/**
 * The companies people belong to: tenants of the business center, contractors and
 * vendors, service providers and visitor organizations. Profiles and visits point at
 * a company; their related lists come with the people module (phase 4).
 */
export const company = defineResource(COMPANY_RESOURCE, {
  texts: {
    label: 'Company',
    labelPlural: 'Companies',
    doc: {
      summary:
        'A company people belong to: a tenant of the business center, a contractor or vendor, a service provider of the building or a visitor organization.',
    },
  },
  basePath: '/companies',
  section: NAV_SECTIONS.organization,
  order: 50,
  icon: NAV_ICONS.companies,
  displayField: 'name',
  data: { provider: 'hasura' },
  fields: companyFields,
  views: {
    list: {
      columns: ['name', 'kind', 'status', 'suite', 'contact_email'],
      defaultSort: [{ field: 'name', direction: 'asc' }],
      search: { fields: ['name', 'contact_email', 'cost_center'] },
      filters: { fields: ['kind', 'status'] },
      savedViews: [
        {
          id: 'tenants',
          texts: 'Tenants',
          state: { filters: [{ field: 'kind', op: 'eq', value: 'tenant' }] },
        },
        {
          id: 'contractors',
          texts: 'Contractors and vendors',
          state: {
            filters: [
              { field: 'kind', op: 'in', value: ['contractor_vendor', 'service_provider'] },
            ],
          },
        },
      ],
    },
  },
});
