import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { PROFILE_DOCUMENT_RESOURCE, PROFILE_RESOURCE } from '../../data/resource-names';
import { enumField } from '../../enums/field';
import { DOCUMENT_KINDS, DOCUMENT_KIND_ENUM } from '../../enums/people-records';
import { boundedNumber } from '../../fields/bounded-number';
import { storageFile } from '../../fields/storage-file';

/** `storage.files.metadata.kind` of a profile document: sensitive, never uploaded or read directly. */
export const PROFILE_DOCUMENT_FILE_KIND = 'profile_document';

/**
 * Columns of `itap.profile_documents` the `org_admin` role reads (`organization_id` left out).
 * Rows are written only by the `upload_profile_document` action; title, kind, version and
 * validity are editable afterwards. The file opens through `open_file` (audited) on each click.
 */
export const profileDocumentFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  profile_id: f.relation({
    to: PROFILE_RESOURCE,
    write: 'never',
    open: 'page',
    texts: { label: 'Person', doc: { summary: 'The profile the document belongs to.' } },
  }),
  title: f.string({ required: true, max: 200, texts: 'Title' }),
  kind: enumField(DOCUMENT_KINDS, DOCUMENT_KIND_ENUM, {
    required: true,
    default: 'other',
    texts: { label: 'Kind', doc: { summary: 'What the document is: identity card, contract, NDA, badge photo or other.' } },
  }),
  file_id: storageFile({
    bucket: 'organization',
    kind: PROFILE_DOCUMENT_FILE_KIND,
    sensitive: true,
    displayOnly: true,
    nullable: false,
    texts: {
      label: 'File',
      doc: {
        summary:
          'The stored file (PDF, PNG, JPEG or WebP). Each Open asks for a new short-lived link and is written to the audit log; the link is never kept, so opening an old page again still works.',
      },
    },
  }),
  version: boundedNumber({
    min: 1,
    integer: true,
    texts: {
      label: 'Version',
      doc: { summary: 'The document’s version number, raised by hand when a newer copy replaces it (1 or more).' },
    },
  }),
  valid_until: f.date({
    nullable: true,
    texts: {
      label: 'Valid until',
      doc: { summary: 'When the document expires, such as an identity card’s expiry date; empty when it does not.' },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Uploaded' }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};

/**
 * Documents attached to a profile (identity cards, contracts, NDAs). Sensitive: uploaded only
 * through the profile's "Upload document" flow (the action stores the file), opened only through
 * the audited `open_file`; there is no create here, and no delete.
 */
export const profileDocument = defineResource(PROFILE_DOCUMENT_RESOURCE, {
  texts: {
    label: 'Document',
    labelPlural: 'Documents',
    doc: {
      summary:
        'A document kept on a person’s profile, such as an identity card or a contract. Documents are sensitive: they are uploaded from the profile and every opening is audited.',
    },
  },
  // Reached from a profile's Documents tab: no sidebar entry.
  basePath: '/profile-documents',
  displayField: 'title',
  data: { provider: 'hasura' },
  operations: { create: false, delete: false },
  builtinActions: { delete: false },
  fields: profileDocumentFields,
  views: {
    list: {
      columns: ['title', 'kind', 'profile_id', 'file_id', 'version', 'valid_until', 'created_at'],
      defaultSort: [{ field: 'created_at', direction: 'desc' }],
      search: { fields: ['title'] },
      filters: { fields: ['kind', 'valid_until'] },
    },
  },
});
