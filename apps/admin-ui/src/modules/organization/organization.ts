import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { ORG_LOGOS_BUCKET, storageFile } from '../../fields/storage-file';
import { ORGANIZATION_STATUSES, ORGANIZATION_STATUS_ENUM } from '../../enums/tenancy';

export const ORGANIZATION_RESOURCE = 'organization';

/** Largest logo the console uploads (2 MB). */
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** Fields the platform writes: read, never on the edit form. */
const READ_ONLY_MODES = ['list', 'show'] as const;

const statusField = f.enum(ORGANIZATION_STATUSES, {
  write: 'never',
  in: [...READ_ONLY_MODES],
  texts: {
    label: 'Status',
    doc: {
      summary:
        'Set by the platform operator, not here. A suspended organization keeps its data but no member can switch into it.',
    },
  },
  meta: { enumNamespace: ORGANIZATION_STATUS_ENUM },
});

/**
 * Columns of `itap.organizations` the `org_admin` role reads. Field names are
 * the column names; `mapping.ts` selects exactly these.
 */
export const organizationFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  name: f.string({ required: true, texts: 'Name' }),
  slug: f.string({
    write: 'never',
    in: [...READ_ONLY_MODES],
    texts: {
      label: 'Slug',
      doc: {
        summary:
          'Short unique identifier of the organization across the platform, fixed at creation (for example `nova-tower`).',
      },
    },
  }),
  legal_name: f.string({
    nullable: true,
    texts: {
      label: 'Legal name',
      doc: {
        summary: 'Registered company name for reports and exports, when it differs from the name.',
      },
    },
  }),
  logo_file_id: storageFile({
    bucket: ORG_LOGOS_BUCKET,
    kind: 'logo',
    accept: 'image/png,image/jpeg,image/webp',
    maxSize: LOGO_MAX_BYTES,
    texts: {
      label: 'Logo',
      doc: {
        summary:
          'Image shown next to the organization name in the organization switcher: PNG, JPEG or WebP up to 2 MB. ' +
          'It is stored in the shared `org-logos` bucket, which every member can read; upload a new image to replace it.',
      },
    },
  }),
  timezone: f.string({
    required: true,
    texts: {
      label: 'Time zone',
      doc: {
        summary:
          'IANA zone (for example `Europe/Moscow`) for organization-wide days: daily statistics, report periods and scheduled searches. Each facility has its own zone for its local schedules.',
      },
    },
  }),
  locale: f.string({
    required: true,
    texts: {
      label: 'Language',
      doc: {
        summary:
          'Default language tag (for example `en`); a user’s own language setting takes precedence.',
      },
    },
  }),
  status: { ...statusField, ui: { ...statusField.ui, enum: ORGANIZATION_STATUS_ENUM } },
  created_at: f.dateTime({ system: true, in: [...READ_ONLY_MODES], texts: 'Created' }),
  updated_at: f.dateTime({ system: true, in: [...READ_ONLY_MODES], texts: 'Updated' }),
};

/**
 * The organization the current token is scoped to: one row, edited in place by
 * its administrators. Organizations are created and removed by the platform,
 * never from the console, so there is no create, no delete and no list page.
 */
export const organization = defineResource(ORGANIZATION_RESOURCE, {
  texts: {
    label: 'Organization',
    labelPlural: 'Organizations',
    doc: {
      summary:
        'The tenant the console is working in. All data you see belongs to the current organization; switch it in the sidebar header.',
      see: 'concept/organization-token',
    },
  },
  displayField: 'name',
  operations: { create: false, delete: false },
  builtinActions: { delete: false },
  data: { provider: 'hasura' },
  fields: organizationFields,
  views: {
    list: { page: false },
    show: {
      header: () => ['status'],
      body: (l) => [
        l.panel(['name', 'legal_name', 'slug', 'logo_file_id'], { key: 'profile', texts: 'Profile' }),
        l.panel(['timezone', 'locale'], { key: 'regional', texts: 'Regional settings' }),
        l.panel(['created_at', 'updated_at'], { key: 'record', texts: 'Record', collapse: 'closed' }),
      ],
    },
    edit: {
      body: (l) => [
        l.panel(['name', 'legal_name', 'logo_file_id'], { key: 'profile', texts: 'Profile' }),
        l.panel(['timezone', 'locale'], { key: 'regional', texts: 'Regional settings' }),
      ],
    },
  },
});
