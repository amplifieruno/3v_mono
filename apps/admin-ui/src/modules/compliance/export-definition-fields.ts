import { f } from '@burojs/field-types';
import { USER_RESOURCE } from '../../data/resource-names';
import {
  EXPORT_ENTITIES,
  EXPORT_ENTITY_ENUM,
  EXPORT_FORMATS,
  EXPORT_FORMAT_ENUM,
  EXPORT_MODES,
  EXPORT_MODE_ENUM,
} from '../../enums/compliance-integrations';
import { enumField } from '../../enums/field';
import { rangeValidator } from '../../fields/bounded-number';
import { cronField } from '../../fields/cron';
import { dateTime } from '../../fields/date-time';
import { type FieldProblem, problemValidator } from '../../fields/field-issue';
import { checkNotBlank } from '../../fields/not-blank';
import { timezone } from '../../fields/timezone';

const shown = ['list', 'show'] as const;
const showOnly = ['show'] as const;

/** Rows per file (`export_definitions_max_rows`). */
export const EXPORT_MAX_ROWS = 50_000;

/** `export_definitions_filters_object`: a Hasura `where` object (`{}` for every row). */
export function exportFiltersProblem(value: unknown): FieldProblem | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'object' && !Array.isArray(value)
    ? null
    : { code: 'export.filtersNotObject', text: 'Enter the filters as a JSON object, such as {"status": {"_eq": "active"}}, or {} for every row.' };
}

/**
 * Columns of `itap.export_definitions` the `org_admin` role reads. Every administrator sees every
 * definition; only its owner (who created it) edits, deletes or runs it, because its jobs read the
 * data with the owner's permissions. The cursor and the schedule's bookkeeping are the platform's.
 */
export const exportDefinitionFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  code: f.string({ system: true, in: [...shown], texts: { label: 'Code', doc: { summary: 'The definition’s reference (EXP-00001).' } } }),
  name: f.string({ required: true, validate: checkNotBlank(), texts: { label: 'Name', doc: { summary: 'What the export is called, unique in the organization.' } } }),
  description: f.text({ nullable: true, in: ['show', 'create', 'edit'], texts: { label: 'Description', doc: { summary: 'What the export is for and who receives its files.' } } }),
  entity: enumField(EXPORT_ENTITIES, EXPORT_ENTITY_ENUM, {
    required: true,
    texts: { label: 'Data', doc: { summary: 'What is exported: profiles, identities, events, incidents, visits, access decisions, detections (last 31 days), face authentication attempts or the audit log.' } },
  }),
  format: enumField(EXPORT_FORMATS, EXPORT_FORMAT_ENUM, {
    required: true,
    default: 'csv',
    texts: { label: 'Format', doc: { summary: 'The file written: CSV, JSON or Excel.' } },
  }),
  filters: f.json({
    default: {},
    in: ['show', 'create', 'edit'],
    validate: problemValidator(exportFiltersProblem),
    texts: {
      label: 'Filters',
      description: 'A JSON object in Hasura’s where syntax; {} exports every row.',
      doc: {
        summary:
          'Which rows are exported, as a Hasura where on the data, such as {"status": {"_eq": "active"}}. A filter the data does not understand fails the job with its error. Changing it restarts an incremental export from the beginning.',
      },
    },
  }),
  mode: enumField(EXPORT_MODES, EXPORT_MODE_ENUM, {
    required: true,
    default: 'full',
    texts: { label: 'Mode', doc: { summary: 'Full exports every matching row each time; incremental only the rows created since the last completed job.' } },
  }),
  max_rows: f.number({
    nullable: true,
    integer: true,
    min: 1,
    max: EXPORT_MAX_ROWS,
    validate: rangeValidator({ min: 1, max: EXPORT_MAX_ROWS, integer: true }),
    in: ['show', 'create', 'edit'],
    texts: {
      label: 'Rows per file',
      doc: { summary: 'The most rows one file holds, 1 to 50,000 (50,000 when empty). A longer export is cut and marked truncated; an incremental one continues in the next job.' },
    },
  }),
  schedule_cron: cronField({
    texts: {
      label: 'Schedule',
      description: 'Leave empty to run by hand only.',
      doc: { summary: 'When a job runs by itself, as a cron in the time zone below (checked every 15 minutes). Jobs always run as the owner.' },
    },
  }),
  timezone: timezone({
    required: true,
    default: 'UTC',
    texts: { label: 'Time zone', doc: { summary: 'The zone the schedule is read in.' } },
  }),
  is_active: f.boolean({
    default: true,
    texts: { label: 'Active', doc: { summary: 'Whether the schedule runs it; an inactive definition still runs by hand.' } },
  }),
  owner_id: f.relation({
    to: USER_RESOURCE,
    system: true,
    in: [...shown],
    open: 'none',
    texts: { label: 'Owner', doc: { summary: 'Who created it: the only member who changes, deletes or runs it, and the only one who can open its files.' } },
  }),
  watermark: dateTime({
    system: true,
    in: [...showOnly],
    texts: { label: 'Exported up to', doc: { summary: 'Incremental mode: the creation time of the last row exported; the next job starts after it. Reset when the data, filters or mode change.' } },
  }),
  next_run_at: dateTime({ system: true, in: [...shown], texts: { label: 'Next run', doc: { summary: 'When the schedule runs it next.' } } }),
  last_run_at: dateTime({ system: true, in: [...showOnly], texts: { label: 'Last scheduled run', doc: { summary: 'When the schedule last ran it. Run now does not change it.' } } }),
  last_error: f.string({
    system: true,
    nullable: true,
    in: [...showOnly],
    texts: { label: 'Last schedule error', doc: { summary: 'Why the last scheduled run did not start a job (owner_not_member: the owner is no longer an active member).' } },
  }),
  created_at: f.dateTime({ system: true, in: [...showOnly], texts: { label: 'Created', doc: { summary: 'When the definition was created.' } } }),
  updated_at: f.dateTime({ system: true, in: [...showOnly], texts: { label: 'Updated', doc: { summary: 'When it last changed.' } } }),
};
