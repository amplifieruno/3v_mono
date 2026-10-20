import { CsvError, parseCsv } from '../bulk/csv.js';

/**
 * HR fixture parsing and field mapping (slice 10 task 4). A fixture is a JSON array of records, a JSON document
 * `{ "records": [...] }` or a CSV with a header row (one record per line). `integrations.field_mapping` maps source
 * keys to profile columns (or `custom_fields.<key>`); without a mapping, source keys named like a column map to it.
 * Error codes never carry source values (they end up in the run's errors).
 */

/** A sync failure with a code (the run's error). */
export class SyncFailure extends Error {
  constructor(code: string) {
    super(code);
    this.name = 'SyncFailure';
  }
}

export const MAX_FIXTURE_RECORDS = 10_000;
export const MAX_FIXTURE_BYTES = 5 * 1024 * 1024;

/** Profile columns an HR integration may write (a subset of the org_admin profile insert/update columns). */
export const PROFILE_TARGETS = [
  'first_name', 'last_name', 'email', 'phone', 'employee_id', 'department', 'job_title', 'profile_type', 'status',
  'access_level', 'start_date', 'end_date', 'notes',
] as const;
const CUSTOM_PREFIX = 'custom_fields.';
const CUSTOM_KEY = /^[a-z][a-z0-9_]{0,62}$/;

export type MappedRecord = {
  externalId: string;
  /** Profile column -> value (null clears); only columns present in the record. */
  fields: Record<string, string | null>;
  customFields: Record<string, string | null>;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(text: string): unknown[] {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new SyncFailure('fixture_invalid');
  }
  if (Array.isArray(doc)) return doc;
  if (isObject(doc) && Array.isArray(doc.records)) return doc.records;
  throw new SyncFailure('fixture_invalid');
}

function parseCsvRecords(text: string): Record<string, string>[] {
  let rows: string[][];
  try {
    rows = parseCsv(text);
  } catch (error: unknown) {
    if (error instanceof CsvError) throw new SyncFailure('fixture_invalid');
    throw error;
  }
  const [header, ...body] = rows;
  if (!header || header.some((h) => h.trim() === '')) throw new SyncFailure('fixture_invalid');
  return body
    .filter((row) => !(row.length === 1 && row[0] === ''))
    .map((row) => Object.fromEntries(header.map((h, i) => [h.trim(), row[i] ?? ''])));
}

/** The fixture's records (JSON when it starts with `[` or `{`, else CSV); fixture_invalid / fixture_too_large. */
export function parseFixture(data: Buffer): unknown[] {
  if (data.length > MAX_FIXTURE_BYTES) throw new SyncFailure('fixture_too_large');
  const text = data.toString('utf8').replace(/^\uFEFF/, '');
  const records = /^\s*[[{]/.test(text) ? parseJson(text) : parseCsvRecords(text);
  if (records.length > MAX_FIXTURE_RECORDS) throw new SyncFailure('fixture_too_large');
  return records;
}

function validTarget(target: string): boolean {
  if (target.startsWith(CUSTOM_PREFIX)) return CUSTOM_KEY.test(target.slice(CUSTOM_PREFIX.length));
  return (PROFILE_TARGETS as readonly string[]).includes(target);
}

/** `integrations.field_mapping` validated: source key -> target; field_mapping_invalid:<source key>. */
export function parseFieldMapping(raw: unknown): Record<string, string> {
  if (!isObject(raw)) throw new SyncFailure('field_mapping_invalid');
  const mapping: Record<string, string> = {};
  for (const [source, target] of Object.entries(raw)) {
    if (typeof target !== 'string' || !validTarget(target)) throw new SyncFailure(`field_mapping_invalid:${source}`);
    mapping[source] = target;
  }
  return mapping;
}

/** A scalar source value as profile text: trimmed, blank -> null; objects / arrays are refused (undefined). */
function textValue(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return String(value);
  return undefined;
}

const DATE_COLUMNS = new Set(['start_date', 'end_date']);
const CODE_COLUMNS = new Set(['profile_type', 'status', 'access_level']);

/**
 * Canonical form of a mapped value, so the comparison with the stored profile is exact: dates as YYYY-MM-DD (from a
 * date or an ISO date-time), code columns lower case. Undefined = not a valid value for the column.
 */
export function normalizeValue(column: string, value: string | null): string | null | undefined {
  if (value === null) return null;
  if (DATE_COLUMNS.has(column)) {
    const plain = /^(\d{4}-\d{2}-\d{2})(?:$|[T ])/.exec(value);
    if (plain) return Number.isNaN(Date.parse(`${plain[1]}T00:00:00Z`)) ? undefined : plain[1];
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString().slice(0, 10);
  }
  if (CODE_COLUMNS.has(column)) return value.toLowerCase();
  return value;
}

/** One source record mapped to profile fields, or the code of why it is skipped. */
export function mapRecord(record: unknown, mapping: Record<string, string>, externalIdField: string): MappedRecord | { error: string } {
  if (!isObject(record)) return { error: 'invalid_record' };
  const externalId = textValue(record[externalIdField]);
  if (typeof externalId !== 'string') return { error: 'missing_external_id' };
  const pairs = Object.keys(mapping).length > 0
    ? Object.entries(mapping)
    : Object.keys(record).filter((k) => k !== externalIdField && validTarget(k) && !k.startsWith(CUSTOM_PREFIX)).map((k) => [k, k]);
  const fields: Record<string, string | null> = {};
  const customFields: Record<string, string | null> = {};
  for (const [source, target] of pairs) {
    if (!Object.hasOwn(record, source)) continue;
    const text = textValue(record[source]);
    const value = text === undefined || target.startsWith(CUSTOM_PREFIX) ? text : normalizeValue(target, text);
    if (value === undefined) return { error: `invalid_value:${target}` };
    if (target.startsWith(CUSTOM_PREFIX)) customFields[target.slice(CUSTOM_PREFIX.length)] = value;
    else fields[target] = value;
  }
  return { externalId, fields, customFields };
}
