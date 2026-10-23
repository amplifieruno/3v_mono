import type { FieldTexts } from '@burojs/core';
import { f } from '@burojs/field-types';
import { checkCron } from './cron-format';
import { type FieldProblem, problemValidator } from './field-issue';
import { isTimezone } from './timezone-zones';

/** The field implementation id of {@link integrationConfig} (`./integration-config-impl.ts`, display only). */
export const INTEGRATION_CONFIG_FIELD = 'itap.integration-config';

/** What the display draws: the settings (`config`) or the field mapping (`field_mapping`). */
export type IntegrationJsonKind = 'config' | 'mapping';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * `integrations_config_object`, `integrations_schedule_valid` and `integrations_fixture_file_valid`:
 * an object whose `schedule_cron` is a cron the platform accepts, `schedule_timezone` a known zone
 * and `fixture_file_id` a file id.
 */
export function integrationConfigProblem(value: unknown): FieldProblem | null {
  if (value === null || value === undefined) return null;
  if (!isObject(value)) return { code: 'integration.configNotObject', text: 'Enter a JSON object of settings, or {} for none.' };
  const cron = value.schedule_cron;
  if (cron !== undefined && (typeof cron !== 'string' || checkCron(cron) !== null)) {
    return {
      code: 'integration.scheduleCron',
      text: 'schedule_cron must be a cron the platform accepts (minute hour day month weekday), such as "0 2 * * *"; use Schedule to pick one.',
    };
  }
  const zone = value.schedule_timezone;
  if (zone !== undefined && !isTimezone(zone)) {
    return { code: 'integration.scheduleTimezone', text: 'schedule_timezone must be a time zone such as "Europe/Moscow" or "UTC".' };
  }
  const fixture = value.fixture_file_id;
  if (fixture !== undefined && (typeof fixture !== 'string' || !UUID.test(fixture))) {
    return { code: 'integration.fixtureFile', text: 'fixture_file_id must be the id of an uploaded file.' };
  }
  return null;
}

/** `integrations_field_mapping_object`; each source field maps to a column name (text). */
export function fieldMappingProblem(value: unknown): FieldProblem | null {
  if (value === null || value === undefined) return null;
  if (!isObject(value)) return { code: 'integration.mappingNotObject', text: 'Enter a JSON object of source field → column, or {} for none.' };
  const bad = Object.entries(value).find(([, column]) => typeof column !== 'string' || column.trim() === '');
  return bad === undefined
    ? null
    : { code: 'integration.mappingColumn', text: `Source field “${bad[0]}” must map to a column name.`, params: { field: bad[0] } };
}

export interface IntegrationJsonOptions {
  readonly kind: IntegrationJsonKind;
  readonly texts?: string | FieldTexts;
  readonly in?: readonly ('list' | 'show' | 'create' | 'edit')[];
}

/**
 * An integration's `config` or `field_mapping` (jsonb objects). Edited as JSON (the kit's input),
 * validated as the table's CHECKs state it; displayed in words: the schedule as a sentence with its
 * zone, the other settings as name and value, or the mapping as source field → profile column.
 */
export function integrationJson(opts: IntegrationJsonOptions) {
  const base = f.json({
    default: {},
    validate: problemValidator(opts.kind === 'config' ? integrationConfigProblem : fieldMappingProblem),
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
    ...(opts.in === undefined ? {} : { in: [...opts.in] }),
  });
  return { ...base, ui: { ...base.ui, display: INTEGRATION_CONFIG_FIELD }, meta: { kind: opts.kind } };
}
