import { type Rule, type RuleContext, defineResource, isRecordProbe } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { EXPORT_DEFINITION_RESOURCE, EXPORT_JOB_RESOURCE, USER_RESOURCE } from '../../data/resource-names';
import {
  EXPORT_ENTITIES,
  EXPORT_ENTITY_ENUM,
  EXPORT_FORMATS,
  EXPORT_FORMAT_ENUM,
  EXPORT_JOB_STATUSES,
  EXPORT_JOB_STATUS_ENUM,
  EXPORT_MODES,
  EXPORT_MODE_ENUM,
  JOB_TRIGGERS,
  JOB_TRIGGER_ENUM,
} from '../../enums/compliance-integrations';
import { enumField } from '../../enums/field';
import { dateTime } from '../../fields/date-time';
import { storageFile } from '../../fields/storage-file';
import { recordDate } from '../people/record-date';
import { jobWatchBlock } from './job-watch-block';

/** `storage.files.metadata.kind` of an export file: owner-only and sensitive (opened through `open_file`, audited). */
export const EXPORT_FILE_KIND = 'export';

type Row = Readonly<Record<string, unknown>> | null | undefined;

const lower = (value: unknown): string => (typeof value === 'string' ? value.toLowerCase() : '');

/** Whether the rule's record belongs to another member (`column` names the owner); `false` without a row. */
export function ownedByOther(ctx: Pick<RuleContext, 'record' | 'user'>, column: string): boolean {
  if (isRecordProbe(ctx.record)) return false;
  const row = ctx.record as Row;
  if (typeof row?.id !== 'string' || row.id === '') return false;
  return lower(row[column]) !== lower(ctx.user.id);
}

/** Why another member's export file is not offered (Review Focus 4; `open_file` refuses it too). */
export const NOT_OWNER_FILE_REASON = 'Only the member who ran the export can open its file (export files are owner-only).';

/**
 * Review Focus 4: an export file is its owner's (the requester). Another administrator sees the job
 * but no link: the file field shows the reason instead (`open_file` answers "not found" anyway).
 */
export const EXPORT_JOB_RULES: Rule[] = [
  {
    target: { kind: 'field', name: 'file_id' },
    deny: 'view',
    when: (ctx) => ownedByOther(ctx, 'requested_by'),
    fallback: 'disable',
    reason: NOT_OWNER_FILE_REASON,
  },
];

const shown = ['list', 'show'] as const;
const showOnly = ['show'] as const;

/**
 * Columns of `itap.export_jobs` the `org_admin` role reads: a snapshot of the definition when the
 * job was requested, then the job's progress, written by the platform (read-only here).
 */
export const exportJobFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  created_at: dateTime({ system: true, texts: { label: 'Requested', doc: { summary: 'When the job was requested (Run now or the schedule).' } } }),
  definition_id: f.relation({
    to: EXPORT_DEFINITION_RESOURCE,
    system: true,
    open: 'page',
    texts: { label: 'Definition', doc: { summary: 'The export definition the job ran.' } },
  }),
  trigger: enumField(JOB_TRIGGERS, JOB_TRIGGER_ENUM, { system: true, texts: { label: 'Started by', doc: { summary: 'By hand (Run now) or by the schedule.' } } }),
  status: enumField(EXPORT_JOB_STATUSES, EXPORT_JOB_STATUS_ENUM, {
    system: true,
    texts: { label: 'Status', doc: { summary: 'Queued, running, completed (the file is ready) or failed (see the error).' } },
  }),
  entity: enumField(EXPORT_ENTITIES, EXPORT_ENTITY_ENUM, { system: true, in: [...shown], texts: { label: 'Data', doc: { summary: 'What was exported (as the definition said then).' } } }),
  format: enumField(EXPORT_FORMATS, EXPORT_FORMAT_ENUM, { system: true, in: [...shown], texts: { label: 'Format', doc: { summary: 'The file’s format.' } } }),
  mode: enumField(EXPORT_MODES, EXPORT_MODE_ENUM, { system: true, in: [...showOnly], texts: { label: 'Mode', doc: { summary: 'Full or incremental, as the definition said then.' } } }),
  filters: f.json({ system: true, in: [...showOnly], texts: { label: 'Filters', doc: { summary: 'The filters the job applied (a snapshot of the definition’s).' } } }),
  row_count: f.number({ system: true, nullable: true, in: [...shown], texts: { label: 'Rows', doc: { summary: 'Rows in the file.' } } }),
  truncated: f.boolean({
    system: true,
    in: [...shown],
    texts: { label: 'Truncated', doc: { summary: 'More rows matched than the definition’s rows per file: the file was cut (an incremental export continues next time).' } },
  }),
  file_id: storageFile({
    bucket: 'organization',
    kind: EXPORT_FILE_KIND,
    sensitive: true,
    displayOnly: true,
    in: [...showOnly],
    texts: { label: 'File', doc: { summary: 'The exported file. Only the member who ran the export can open it; each opening is audited.' } },
  }),
  requested_by: f.relation({
    to: USER_RESOURCE,
    system: true,
    in: [...shown],
    open: 'none',
    texts: { label: 'Requested by', doc: { summary: 'The definition’s owner, as whom the data was read; the only member who can open the file.' } },
  }),
  watermark_from: dateTime({ system: true, in: [...showOnly], texts: { label: 'From', doc: { summary: 'Incremental: rows created after this time were exported.' } } }),
  watermark_to: dateTime({ system: true, in: [...showOnly], texts: { label: 'To', doc: { summary: 'Incremental: the creation time of the last row exported.' } } }),
  error: f.string({ system: true, nullable: true, in: [...showOnly], texts: { label: 'Error', doc: { summary: 'Why the job failed, as the platform reported it.' } } }),
  attempts: f.number({ system: true, in: [...showOnly], texts: { label: 'Attempts', doc: { summary: 'How many times a worker picked the job up; three fail it.' } } }),
  started_at: dateTime({ system: true, in: [...showOnly], texts: { label: 'Started', doc: { summary: 'When a worker first picked the job up.' } } }),
  finished_at: dateTime({ system: true, in: [...shown], texts: { label: 'Finished', doc: { summary: 'When the job completed or failed.' } } }),
};

export const EXPORT_JOB_COLUMNS = ['created_at', 'trigger', 'status', 'row_count', 'truncated', 'requested_by', 'finished_at'] as const;

/**
 * Export jobs (`itap.export_jobs`): every run of an export definition and its file. Read-only;
 * started by Run now on a definition or by its schedule. The file is its requester's only.
 */
export const exportJob = defineResource(EXPORT_JOB_RESOURCE, {
  texts: {
    label: 'Export job',
    labelPlural: 'Export jobs',
    doc: { summary: 'One run of an export definition: its status, rows and the file, which only the member who ran it can open.' },
  },
  basePath: '/export-jobs',
  section: NAV_SECTIONS.compliance,
  order: 76,
  icon: NAV_ICONS.exportJobs,
  displayField: 'created_at',
  recordTitle: (record) => recordDate('Export job at', record.created_at),
  data: { provider: 'hasura' },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: exportJobFields,
  rules: EXPORT_JOB_RULES,
  views: {
    list: {
      columns: ['created_at', 'definition_id', 'entity', 'format', 'status', 'row_count', 'requested_by', 'finished_at'],
      defaultSort: [{ field: 'created_at', direction: 'desc' }],
      filters: { pinned: ['definition_id', 'status'], fields: ['definition_id', 'status', 'entity', 'trigger', 'requested_by', 'created_at'] },
      savedViews: [{ id: 'failed', texts: 'Failed', state: { filters: [{ field: 'status', op: 'eq', value: 'failed' }] } }],
    },
    show: {
      header: (l) => [l.grid(['definition_id', 'status', 'trigger', 'created_at'])],
      body: (l) => [
        l.place(jobWatchBlock, { key: 'export-watch', props: { job: 'export_job', id: l.ref('record', 'id'), status: l.ref('record', 'status') } }),
        l.panel(['error'], { key: 'failure', tone: 'destructive', texts: { title: 'The export failed' }, when: l.present(l.ref('record', 'error')) }),
        l.panel(['file_id', l.grid(['row_count', 'truncated', 'requested_by'])], { key: 'file', texts: { title: 'File' } }),
        l.grid(['entity', 'format', 'mode']),
        'filters',
        l.grid(['watermark_from', 'watermark_to']),
        l.grid(['started_at', 'finished_at', 'attempts']),
      ],
    },
  },
});
