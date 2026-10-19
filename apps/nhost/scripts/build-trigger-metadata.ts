import { stringify } from 'yaml';
import type {
  CronSpec,
  EventTriggerMetadata,
  RetrySpec,
  TableSpec,
  TriggerOperation,
  WebhookHeader,
} from '../metadata-src/types.js';

/** Hasura limits event trigger names to 42 characters (its SQL trigger names embed them). */
const TRIGGER_NAME = /^[a-z][a-z0-9_]{0,41}$/;
const CRON_NAME = /^[a-z][a-z0-9_]{0,62}$/;
const CRON_FIELD = /^[0-9*,/-]+$/;
const OPERATIONS: TriggerOperation[] = ['insert', 'update', 'delete'];
const DEFAULT_RETRY: Required<RetrySpec> = { num_retries: 3, retry_interval_seconds: 10, timeout_seconds: 60 };
/** Hasura default: a missed cron run older than this is dropped instead of delivered late (6 h). */
const CRON_TOLERANCE_SECONDS = 21600;

const webhook = (name: string): string => `{{BACKEND_URL}}/hasura/events/${name}`;
const headers = (): WebhookHeader[] => [{ name: 'x-action-secret', value_from_env: 'ACTION_SECRET' }];

function retryOf(owner: string, retry: RetrySpec = {}): Required<RetrySpec> {
  const merged = { ...DEFAULT_RETRY, ...retry };
  const ok =
    Number.isInteger(merged.num_retries) &&
    merged.num_retries >= 0 &&
    Number.isInteger(merged.retry_interval_seconds) &&
    merged.retry_interval_seconds > 0 &&
    Number.isInteger(merged.timeout_seconds) &&
    merged.timeout_seconds > 0;
  if (!ok) throw new Error(`${owner}: invalid retry configuration ${JSON.stringify(retry)}`);
  return merged;
}

/** Event trigger metadata of one table spec (undefined when it declares none). */
export function buildEventTriggers(spec: TableSpec, columns: string[]): EventTriggerMetadata[] | undefined {
  if (!spec.eventTriggers) return undefined;
  return [...spec.eventTriggers]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((trigger) => {
      const owner = `Table ${spec.name}: event trigger "${trigger.name}"`;
      if (!TRIGGER_NAME.test(trigger.name)) {
        throw new Error(`Table ${spec.name}: invalid event trigger name "${trigger.name}" (snake_case, <= 42 chars)`);
      }
      if (trigger.operations.length === 0) throw new Error(`${owner}: needs at least one operation`);
      if (new Set(trigger.operations).size !== trigger.operations.length) {
        throw new Error(`${owner}: duplicate operation`);
      }
      if (trigger.columns !== undefined) {
        if (!trigger.operations.includes('update')) throw new Error(`${owner}: columns apply to update only`);
        if (trigger.columns.length === 0) throw new Error(`${owner}: columns must not be empty (omit for all)`);
        const unknown = trigger.columns.find((c) => !columns.includes(c));
        if (unknown) throw new Error(`${owner}: unknown column "${unknown}"`);
      }
      const retry = retryOf(owner, trigger.retry);
      const definition: EventTriggerMetadata['definition'] = { enable_manual: false };
      for (const op of OPERATIONS.filter((o) => trigger.operations.includes(o))) {
        if (op === 'update') definition.update = { columns: trigger.columns ? [...trigger.columns].sort() : '*' };
        else definition[op] = { columns: '*' };
      }
      return {
        name: trigger.name,
        definition,
        retry_conf: {
          num_retries: retry.num_retries,
          interval_sec: retry.retry_interval_seconds,
          timeout_sec: retry.timeout_seconds,
        },
        webhook: webhook(trigger.name),
        headers: headers(),
      };
    });
}

/** Event trigger names are unique per Hasura source, across all tables. */
export function assertUniqueEventTriggerNames(specs: TableSpec[]): void {
  const seen = new Map<string, string>();
  for (const spec of specs) {
    for (const trigger of spec.eventTriggers ?? []) {
      const other = seen.get(trigger.name);
      if (other) throw new Error(`Duplicate event trigger name "${trigger.name}" (tables ${other} and ${spec.name})`);
      seen.set(trigger.name, spec.name);
    }
  }
}

function assertSchedule(cron: CronSpec): void {
  const fields = cron.schedule.trim().split(/\s+/);
  if (fields.length !== 5 || !fields.every((f) => CRON_FIELD.test(f))) {
    throw new Error(`Cron ${cron.name}: invalid schedule "${cron.schedule}" (5-field cron expression)`);
  }
}

/** cron_triggers.yaml content for the cron registry (metadata-src/crons.ts). */
export function buildCronTriggersYaml(crons: CronSpec[]): string {
  const names = new Set<string>();
  for (const cron of crons) {
    if (!CRON_NAME.test(cron.name)) throw new Error(`Cron: invalid cron trigger name "${cron.name}" (snake_case)`);
    if (names.has(cron.name)) throw new Error(`Duplicate cron trigger name "${cron.name}"`);
    names.add(cron.name);
    assertSchedule(cron);
  }
  if (crons.length === 0) return '[]\n';
  const entries = [...crons]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((cron) => ({
      name: cron.name,
      webhook: webhook(cron.name),
      schedule: cron.schedule.trim(),
      include_in_metadata: cron.includeInMetadata,
      payload: cron.payload ?? {},
      retry_conf: { ...retryOf(`Cron ${cron.name}`, cron.retry), tolerance_seconds: CRON_TOLERANCE_SECONDS },
      headers: headers(),
      ...(cron.comment ? { comment: cron.comment } : {}),
    }));
  return stringify(entries, { lineWidth: 0 });
}
