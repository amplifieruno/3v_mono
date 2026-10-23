import { z } from 'zod';

/*
 * The answer of `get_system_status` (`apps/backend/src/actions/systemStatus.ts`, SQL
 * `itap.system_status`) read defensively: every section is jsonb, so an entry of an unexpected
 * shape is dropped or given a safe default instead of failing the whole page, and an unknown level
 * reads "unknown". Probe, cron and queue names are shown through labels; a name the console does
 * not know is put into words ({@link humanize}).
 */

export const level = z.enum(['ok', 'degraded', 'down', 'unknown']);

export const statusCheck = z.object({
  name: z.string(),
  status: level,
  latency_ms: z.number().nullable(),
  /** The probe's error, or facts such as the recognition model. */
  details: z.record(z.string(), z.unknown()),
});

export const cronStatus = z.object({
  name: z.string(),
  status: level,
  lag_seconds: z.number(),
  errors_24h: z.number(),
  last_scheduled_at: z.string().nullable(),
  last_delivered_at: z.string().nullable(),
});

export const systemStatus = z.object({
  generated_at: z.string().nullable(),
  status: level,
  checks: z.array(statusCheck),
  postgres: z.object({
    connections: z.number().nullable(),
    max_connections: z.number().nullable(),
    db_size_bytes: z.number().nullable(),
    largest_tables: z.array(z.object({ table: z.string(), total_bytes: z.number() })),
  }),
  crons: z.array(cronStatus),
  queues: z.array(z.object({ key: z.string(), count: z.number() })),
  retention: z
    .object({
      run_id: z.string().nullable(),
      status: z.string().nullable(),
      scheduled_at: z.string().nullable(),
      started_at: z.string().nullable(),
      finished_at: z.string().nullable(),
      error: z.string().nullable(),
    })
    .nullable(),
});

export type StatusLevel = z.infer<typeof level>;
export type StatusCheck = z.infer<typeof statusCheck>;
export type CronStatus = z.infer<typeof cronStatus>;
export type SystemStatus = z.infer<typeof systemStatus>;

type Json = Readonly<Record<string, unknown>>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const levelOf = (value: unknown): StatusLevel => {
  const parsed = level.safeParse(value);
  return parsed.success ? parsed.data : 'unknown';
};
const objects = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isObject) : []);

/** The action's answer as the page reads it (`null` when there is no answer at all). */
export function readSystemStatus(raw: unknown): SystemStatus | null {
  if (!isObject(raw)) return null;
  const postgres = isObject(raw.postgres) ? raw.postgres : {};
  const retention = isObject(raw.retention) ? raw.retention : null;
  return {
    generated_at: str(raw.generated_at),
    status: levelOf(raw.status),
    checks: objects(raw.checks)
      .filter((check) => str(check.name) !== null)
      .map((check) => ({
        name: String(check.name),
        status: levelOf(check.status),
        latency_ms: num(check.latency_ms),
        details: isObject(check.details) ? check.details : {},
      })),
    postgres: {
      connections: num(postgres.connections),
      max_connections: num(postgres.max_connections),
      db_size_bytes: num(postgres.db_size_bytes),
      largest_tables: objects(postgres.largest_tables)
        .filter((row) => str(row.table) !== null && num(row.total_bytes) !== null)
        .map((row) => ({ table: String(row.table), total_bytes: Number(row.total_bytes) })),
    },
    crons: objects(raw.crons)
      .filter((cron) => str(cron.name) !== null)
      .map((cron) => ({
        name: String(cron.name),
        status: levelOf(cron.status),
        lag_seconds: num(cron.lag_seconds) ?? 0,
        errors_24h: num(cron.errors_24h) ?? 0,
        last_scheduled_at: str(cron.last_scheduled_at),
        last_delivered_at: str(cron.last_delivered_at),
      })),
    queues: isObject(raw.queues)
      ? Object.entries(raw.queues)
          .filter(([, count]) => num(count) !== null)
          .map(([key, count]) => ({ key, count: Number(count) }))
      : [],
    retention:
      retention === null
        ? null
        : {
            run_id: str(retention.run_id),
            status: str(retention.status),
            scheduled_at: str(retention.scheduled_at),
            started_at: str(retention.started_at),
            finished_at: str(retention.finished_at),
            error: str(retention.error),
          },
  };
}

/** A key in words: `stream_server` → "Stream server". */
export function humanize(key: string): string {
  const words = key.replace(/[_-]+/gu, ' ').trim();
  return words === '' ? key : words.charAt(0).toUpperCase() + words.slice(1);
}

/** A size in bytes, in the largest unit that keeps it above 1 (1 decimal from KB on). */
export function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return unit === 0 ? `${value} B` : `${value.toFixed(1)} ${units[unit]}`;
}

/** A lag in words: "none" under a second, else seconds, minutes, hours or days (two units at most). */
export function formatLag(seconds: number): string {
  if (seconds < 1) return 'none';
  const parts: [number, string][] = [
    [86_400, 'd'],
    [3_600, 'h'],
    [60, 'min'],
    [1, 's'],
  ];
  const out: string[] = [];
  let rest = Math.floor(seconds);
  for (const [size, unit] of parts) {
    if (rest >= size && out.length < 2) {
      out.push(`${Math.floor(rest / size)} ${unit}`);
      rest %= size;
    }
  }
  return out.join(' ');
}
