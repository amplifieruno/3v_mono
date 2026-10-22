import { type Rule, defineResource, relatedList } from '@burojs/core';
import { f } from '@burojs/field-types';
import { resourceByName } from '../../data/resource-by-name';
import {
  INCIDENT_NOTE_FILE_HISTORY_RESOURCE,
  INCIDENT_NOTE_FILE_RESOURCE,
  INCIDENT_NOTE_HISTORY_RESOURCE,
  INCIDENT_NOTE_RESOURCE,
  INCIDENT_RESOURCE,
  USER_RESOURCE,
} from '../../data/resource-names';
import { storageFile } from '../../fields/storage-file';

/**
 * `storage.files.metadata.kind` of a file attached to an incident note: a plain file of the
 * organization's bucket (not a sensitive kind), purged with the incident by retention.
 */
export const INCIDENT_NOTE_FILE_KIND = 'incident_note';

/** Largest file attached to a note (photos, a short clip, a scanned statement). */
export const INCIDENT_NOTE_FILE_MAX_BYTES = 25 * 1024 * 1024;

/** The note columns on the incident's Notes tab. */
export const INCIDENT_NOTE_COLUMNS = ['created_at', 'author_id', 'body'] as const;

const READ_ONLY = {
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
} as const;

/** Columns of `itap.incident_notes` the `org_admin` role reads; the author is stamped by the database. */
export const incidentNoteFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  incident_id: f.relation({
    to: INCIDENT_RESOURCE,
    required: true,
    write: 'create',
    open: 'page',
    providerOptions: { relationship: 'incident' },
    texts: { label: 'Incident', doc: { summary: 'The incident the note is about.' } },
  }),
  body: f.text({
    required: true,
    texts: { label: 'Note', doc: { summary: 'What was seen, done or decided; files are attached on the note’s page.' } },
  }),
  author_id: f.relation({
    to: USER_RESOURCE,
    system: true,
    in: ['list', 'show'],
    open: 'none',
    texts: { label: 'Author', doc: { summary: 'The member who wrote it; only the author can change or delete it.' } },
  }),
  created_at: f.dateTime({ system: true, texts: 'Written', in: ['list', 'show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};

/** Notes are the author's: the database lets only the author change or delete one. */
export const NOTE_RULES: Rule[] = (['edit', 'delete'] as const).map((name) => ({
  target: { kind: 'action', name },
  deny: 'run',
  when: (ctx) => (ctx.record as { readonly author_id?: unknown } | undefined)?.author_id !== ctx.user.id,
  fallback: 'disable',
  reason: 'Only the note’s author can change or delete it.',
}));

/** Columns of `itap.incident_note_files` the `org_admin` role reads; a file is attached or removed, never replaced. */
export const incidentNoteFileFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  note_id: f.relation({
    to: INCIDENT_NOTE_RESOURCE,
    required: true,
    write: 'create',
    open: 'page',
    providerOptions: { relationship: 'note' },
    texts: { label: 'Note', doc: { summary: 'The note the file belongs to.' } },
  }),
  file_id: storageFile({
    bucket: 'organization',
    kind: INCIDENT_NOTE_FILE_KIND,
    nullable: false,
    maxSize: INCIDENT_NOTE_FILE_MAX_BYTES,
    texts: {
      label: 'File',
      doc: {
        summary:
          'A photo, clip or document backing the note (up to 25 MB), stored in the organization’s files; deleted with the incident by retention.',
      },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Attached', in: ['list'] }),
};

const NOTE_TEXTS = {
  label: 'Incident note',
  labelPlural: 'Notes',
  doc: {
    summary:
      'An operator’s note on an incident, with files attached. Adding one records it in the incident’s activity timeline.',
  },
};

const FILE_TEXTS = {
  label: 'Attached file',
  labelPlural: 'Files',
  doc: { summary: 'A file attached to an incident note by its author.' },
};

const filesOf = (resource: string) =>
  relatedList(resourceByName(resource));

/**
 * Notes of an open incident (`itap.incident_notes`): written on the incident's Notes tab, opened
 * on a page of their own where the author attaches files. The database freezes the notes of a
 * closed incident (`incident_note_history` shows them).
 */
export const incidentNote = defineResource(INCIDENT_NOTE_RESOURCE, {
  texts: NOTE_TEXTS,
  basePath: '/incident-notes',
  displayField: 'created_at',
  data: { provider: 'hasura' },
  prefill: { fromQuery: ['incident_id'] },
  rules: NOTE_RULES,
  fields: incidentNoteFields,
  views: {
    list: { page: false, columns: [...INCIDENT_NOTE_COLUMNS] },
    show: {
      header: (l) => [l.grid(['incident_id', 'author_id', 'created_at'])],
      body: (l) => [
        'body',
        l.place(filesOf(INCIDENT_NOTE_FILE_RESOURCE), {
          key: 'note-files',
          props: { where: [{ field: 'note_id', op: 'eq', value: l.ref('record', 'id') }], columns: ['file_id', 'created_at'], open: 'none' },
        }),
        'updated_at',
      ],
    },
    create: { body: () => ['incident_id', 'body'] },
    edit: { body: () => ['incident_id', 'body'] },
  },
});

/** The notes of a closed incident, read only, with their files. */
export const incidentNoteHistory = defineResource(INCIDENT_NOTE_HISTORY_RESOURCE, {
  texts: { ...NOTE_TEXTS, label: 'Incident note (read only)' },
  basePath: '/incident-note-history',
  displayField: 'created_at',
  data: { provider: 'hasura' },
  ...READ_ONLY,
  fields: incidentNoteFields,
  views: {
    list: { page: false, columns: [...INCIDENT_NOTE_COLUMNS] },
    show: {
      header: (l) => [l.grid(['incident_id', 'author_id', 'created_at'])],
      body: (l) => [
        'body',
        l.place(filesOf(INCIDENT_NOTE_FILE_HISTORY_RESOURCE), {
          key: 'note-files',
          props: { where: [{ field: 'note_id', op: 'eq', value: l.ref('record', 'id') }], columns: ['file_id', 'created_at'], open: 'none' },
        }),
        'updated_at',
      ],
    },
  },
});

/**
 * Files of a note (`itap.incident_note_files`): uploaded to the organization's bucket, then linked.
 * Only the note's author attaches or removes them (the database refuses anyone else).
 */
export const incidentNoteFile = defineResource(INCIDENT_NOTE_FILE_RESOURCE, {
  texts: FILE_TEXTS,
  basePath: '/incident-note-files',
  displayField: 'file_id',
  data: { provider: 'hasura' },
  operations: { edit: false },
  fields: incidentNoteFileFields,
  views: {
    list: { page: false, columns: ['file_id', 'created_at'] },
    show: { page: false },
    create: { body: () => ['note_id', 'file_id'] },
  },
});

/** The files of a closed incident's notes, read only. */
export const incidentNoteFileHistory = defineResource(INCIDENT_NOTE_FILE_HISTORY_RESOURCE, {
  texts: { ...FILE_TEXTS, label: 'Attached file (read only)' },
  basePath: '/incident-note-file-history',
  displayField: 'file_id',
  data: { provider: 'hasura' },
  ...READ_ONLY,
  fields: incidentNoteFileFields,
  views: {
    list: { page: false, columns: ['file_id', 'created_at'] },
    show: { page: false },
  },
});
