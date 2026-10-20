import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import type { CronSpec, TableSpec } from '../metadata-src/types.js';
import { buildTableMetadata } from './build-table-metadata.js';
import { assertUniqueEventTriggerNames, buildCronTriggersYaml, buildEventTriggers } from './build-trigger-metadata.js';

const columns = ['id', 'organization_id', 'status', 'name'];
const headers = [{ name: 'x-action-secret', value_from_env: 'ACTION_SECRET' }];
const defaultEventRetry = { num_retries: 3, interval_sec: 10, timeout_sec: 60 };

function spec(eventTriggers: TableSpec['eventTriggers']): TableSpec {
  return { name: 'reports', profile: 'tenant_crud', eventTriggers };
}

describe('buildEventTriggers', () => {
  it('should emit webhook, secret header and default retries for each trigger', () => {
    const triggers = buildEventTriggers(spec([{ name: 'render_report', operations: ['insert'] }]), columns);
    expect(triggers).toEqual([
      {
        name: 'render_report',
        definition: { enable_manual: false, insert: { columns: '*' } },
        retry_conf: defaultEventRetry,
        webhook: '{{BACKEND_URL}}/hasura/events/render_report',
        headers,
      },
    ]);
  });

  it('should restrict update columns, keep insert/delete on all columns and apply retry overrides', () => {
    const [trigger] = buildEventTriggers(
      spec([
        {
          name: 'status_changed',
          operations: ['delete', 'update', 'insert'],
          columns: ['status', 'name'],
          retry: { num_retries: 5, timeout_seconds: 30 },
        },
      ]),
      columns,
    ) ?? [];
    expect(trigger.definition).toEqual({
      enable_manual: false,
      insert: { columns: '*' },
      update: { columns: ['name', 'status'] },
      delete: { columns: '*' },
    });
    expect(trigger.retry_conf).toEqual({ num_retries: 5, interval_sec: 10, timeout_sec: 30 });
  });

  it('should restrict the payload to the listed columns on every operation', () => {
    const [trigger] =
      buildEventTriggers(
        spec([{ name: 'run_sync', operations: ['insert', 'update'], columns: ['status'], payloadColumns: ['status', 'id'] }]),
        columns,
      ) ?? [];
    expect(trigger.definition).toEqual({
      enable_manual: false,
      insert: { columns: '*', payload: ['id', 'status'] },
      update: { columns: ['status'], payload: ['id', 'status'] },
    });
  });

  it('should return undefined when the spec declares no event triggers', () => {
    expect(buildEventTriggers(spec(undefined), columns)).toBeUndefined();
  });

  it.each([
    [[{ name: 'Bad-Name', operations: ['insert'] }], /invalid event trigger name/],
    [[{ name: 'x'.repeat(43), operations: ['insert'] }], /invalid event trigger name/],
    [[{ name: 't', operations: [] }], /at least one operation/],
    [[{ name: 't', operations: ['insert', 'insert'] }], /duplicate operation/],
    [[{ name: 't', operations: ['update'], columns: ['nope'] }], /unknown column "nope"/],
    [[{ name: 't', operations: ['insert'], columns: ['status'] }], /columns apply to update/],
    [[{ name: 't', operations: ['update'], columns: [] }], /columns must not be empty/],
    [[{ name: 't', operations: ['insert'], payloadColumns: [] }], /payloadColumns must not be empty/],
    [[{ name: 't', operations: ['insert'], payloadColumns: ['secret'] }], /unknown payload column "secret"/],
    [[{ name: 't', operations: ['insert'], retry: { num_retries: -1 } }], /retry/],
    [[{ name: 't', operations: ['insert'], retry: { timeout_seconds: 0 } }], /retry/],
  ] as [NonNullable<TableSpec['eventTriggers']>, RegExp][])('should reject an invalid trigger %#', (triggers, error) => {
    expect(() => buildEventTriggers(spec(triggers), columns)).toThrow(error);
  });

  it('should be part of the generated table metadata', () => {
    const metadata = buildTableMetadata(spec([{ name: 'render_report', operations: ['insert'] }]), columns, [], []);
    expect(metadata.event_triggers?.map((t) => t.name)).toEqual(['render_report']);
    expect(buildTableMetadata(spec(undefined), columns, [], []).event_triggers).toBeUndefined();
  });
});

describe('assertUniqueEventTriggerNames', () => {
  it('should reject the same trigger name on two tables (Hasura names are unique per source)', () => {
    const a: TableSpec = { name: 'a', profile: 'none', eventTriggers: [{ name: 'sync', operations: ['insert'] }] };
    const b: TableSpec = { name: 'b', profile: 'none', eventTriggers: [{ name: 'sync', operations: ['delete'] }] };
    expect(() => assertUniqueEventTriggerNames([a, b])).toThrow(/Duplicate event trigger name "sync"/);
    expect(() => assertUniqueEventTriggerNames([a])).not.toThrow();
  });
});

describe('buildCronTriggersYaml', () => {
  const heartbeat: CronSpec = { name: 'heartbeat', schedule: '*/5 * * * *', includeInMetadata: true, comment: 'Wiring' };

  it('should emit an empty list when there are no crons', () => {
    expect(buildCronTriggersYaml([])).toBe('[]\n');
  });

  it('should emit webhook, header, schedule, payload and default retries sorted by name', () => {
    const yaml = buildCronTriggersYaml([
      { name: 'zeta', schedule: '0 * * * *', payload: { scope: 'all' }, includeInMetadata: true },
      heartbeat,
    ]);
    expect(parse(yaml)).toEqual([
      {
        name: 'heartbeat',
        webhook: '{{BACKEND_URL}}/hasura/events/heartbeat',
        schedule: '*/5 * * * *',
        include_in_metadata: true,
        payload: {},
        retry_conf: { num_retries: 3, retry_interval_seconds: 10, timeout_seconds: 60, tolerance_seconds: 21600 },
        headers,
        comment: 'Wiring',
      },
      {
        name: 'zeta',
        webhook: '{{BACKEND_URL}}/hasura/events/zeta',
        schedule: '0 * * * *',
        include_in_metadata: true,
        payload: { scope: 'all' },
        retry_conf: { num_retries: 3, retry_interval_seconds: 10, timeout_seconds: 60, tolerance_seconds: 21600 },
        headers,
      },
    ]);
  });

  it('should use a per-cron toleranceSeconds and keep the 6 h default otherwise', () => {
    const [fast, slow] = parse(
      buildCronTriggersYaml([
        { name: 'fast', schedule: '* * * * *', toleranceSeconds: 120, includeInMetadata: true },
        { name: 'slow', schedule: '0 * * * *', toleranceSeconds: 0, includeInMetadata: true },
      ]),
    ) as { retry_conf: { tolerance_seconds: number } }[];
    expect(fast.retry_conf.tolerance_seconds).toBe(120);
    expect(slow.retry_conf.tolerance_seconds).toBe(0);
  });

  it.each([
    [[{ ...heartbeat, toleranceSeconds: -1 }], /toleranceSeconds/],
    [[{ ...heartbeat, toleranceSeconds: 1.5 }], /toleranceSeconds/],
    [[heartbeat, heartbeat], /Duplicate cron trigger name "heartbeat"/],
    [[{ ...heartbeat, name: 'Heart Beat' }], /invalid cron trigger name/],
    [[{ ...heartbeat, schedule: 'every minute' }], /invalid schedule/],
    [[{ ...heartbeat, schedule: '* * * *' }], /invalid schedule/],
    [[{ ...heartbeat, retry: { retry_interval_seconds: -1 } }], /retry/],
  ] as [CronSpec[], RegExp][])('should reject an invalid cron %#', (crons, error) => {
    expect(() => buildCronTriggersYaml(crons)).toThrow(error);
  });
});
