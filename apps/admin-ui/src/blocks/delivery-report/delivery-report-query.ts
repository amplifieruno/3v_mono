import { defineQuery } from '@burojs/core';
import { f } from '@burojs/field-types';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { NOTIFICATION_DELIVERY_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';

/** The registry key the delivery report operations are bound under. */
export const DELIVERY_REPORT_BINDING = 'notification-delivery-report';

/** The periods the report offers, each the last so many hours up to now. */
export const REPORT_PERIODS = ['24h', '7d', '30d'] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

const PERIOD_HOURS: Readonly<Record<ReportPeriod, number>> = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30 };

/** `[from, to)` of a period ending at `now`, as `delivery_report` takes it. */
export function periodBounds(period: ReportPeriod, now: Date = new Date()): { from: string; to: string } {
  return { from: new Date(now.getTime() - PERIOD_HOURS[period] * 3_600_000).toISOString(), to: now.toISOString() };
}

/** A Postgres numeric as Hasura sends it (a number, or a string when numerics are stringified). */
const numeric = z.union([z.number(), z.string()]).nullable().transform((value) => (value === null ? null : Number(value)));

/** One channel of `delivery_report` (`itap_results.delivery_report_rows`). */
export const reportRow = z.object({
  channel: z.string(),
  total: z.number(),
  pending: z.number(),
  sent: z.number(),
  delivered: z.number(),
  failed: z.number(),
  dead_letter: z.number(),
  digested: z.number(),
  acknowledged: z.number(),
  ack_rate: numeric,
  avg_response_seconds: numeric,
  escalations: z.number(),
});

export type ReportRow = z.infer<typeof reportRow>;

const reportInput = z.object({ period: z.enum(REPORT_PERIODS) });

const REPORT_DOCUMENT = `query DeliveryReport($from: timestamptz!, $to: timestamptz!) {
  delivery_report(args: { p_from: $from, p_to: $to }) {
    channel
    total
    pending
    sent
    delivered
    failed
    dead_letter
    digested
    acknowledged
    ack_rate
    avg_response_seconds
    escalations
  }
}`;

function rowsOf(data: unknown): ReportRow[] {
  const rows = z.array(reportRow).safeParse(rootOf(data, 'delivery_report'));
  return rows.success ? rows.data : [];
}

const variables = (input: unknown) => periodBounds((input as z.infer<typeof reportInput>).period);

/** The headline figures of a period, over every channel. */
export const reportFacts = z.object({
  total: z.number(),
  delivered: z.number(),
  waiting: z.number(),
  failed: z.number(),
  dead_letter: z.number(),
  ack_rate: z.string().nullable(),
  avg_response: z.string().nullable(),
  escalations: z.number(),
});

/** Seconds as "4 min 12 s" (under a minute "12 s", an hour or more "2 h 5 min"). */
export function formatSeconds(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${s % 60} s`;
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

/** The figures of {@link reportFacts} from the per-channel rows; the response figures are the in-app channel's. */
export function factsOf(rows: readonly ReportRow[]): z.infer<typeof reportFacts> {
  const sum = (pick: (row: ReportRow) => number) => rows.reduce((total, row) => total + pick(row), 0);
  const inApp = rows.find((row) => row.channel === 'in_app');
  return {
    total: sum((row) => row.total),
    delivered: sum((row) => row.delivered),
    waiting: sum((row) => row.pending),
    failed: sum((row) => row.failed),
    dead_letter: sum((row) => row.dead_letter),
    ack_rate: inApp?.ack_rate === null || inApp?.ack_rate === undefined ? null : `${Math.round(inApp.ack_rate * 100)}%`,
    avg_response:
      inApp?.avg_response_seconds === null || inApp?.avg_response_seconds === undefined ? null : formatSeconds(inApp.avg_response_seconds),
    escalations: sum((row) => row.escalations),
  };
}

/** The report of a period: the headline figures and, under `channels`, the per-channel rows. */
export const report = reportFacts.extend({ channels: z.array(reportRow) });

export type Report = z.infer<typeof report>;

/** One read of `delivery_report` serves both the facts block and the table, so they agree. */
export function reportOf(data: unknown): Report {
  const channels = rowsOf(data);
  return { ...factsOf(channels), channels };
}

export const deliveryReportOperation = hasuraOperation(DELIVERY_REPORT_BINDING, 'deliveryReport', {
  kind: 'query',
  document: REPORT_DOCUMENT,
  variables,
  mapResult: reportOf,
});

const reads = [resourceByName(NOTIFICATION_DELIVERY_RESOURCE)];

/**
 * `delivery_report(hasura_session, p_from, p_to)` for the last 24 hours, 7 or 30 days: per channel,
 * the deliveries created in the period by status, acknowledgements, the in-app acknowledgement rate
 * and response time, and escalation pages. The webhook row counts webhook deliveries
 * (`webhook_deliveries`), which the delivery log does not list (they have a log of their own). Digest items
 * are not in the totals (each is carried by its digest). Other members' subscription deliveries
 * are not counted, as the log does not list them.
 *
 * One query feeds the page's facts block (its declared `fields`, the headline figures over every
 * channel) and the per-channel table (`channels`), so a period is read once and both agree.
 */
export const deliveryReport = defineQuery('itap:delivery-report', {
  binding: deliveryReportOperation.binding,
  input: schema(reportInput),
  output: schema(report),
  reads,
  fields: {
    total: f.number({ texts: { label: 'Notifications', doc: { summary: 'Deliveries created in the period, every channel (digest items counted once, in their digest).' } } }),
    delivered: f.number({ texts: { label: 'Delivered', doc: { summary: 'Deliveries that reached their recipient.' } } }),
    waiting: f.number({ texts: { label: 'Waiting', doc: { summary: 'Deliveries still pending or waiting for a retry.' } } }),
    failed: f.number({ texts: { label: 'Failed', doc: { summary: 'Deliveries whose last attempt failed and are tried again.' } } }),
    dead_letter: f.number({ texts: { label: 'Dead letters', doc: { summary: 'Deliveries given up after the last attempt or for an inactive recipient.' } } }),
    ack_rate: f.string({
      texts: { label: 'Acknowledged in-app', doc: { summary: 'The share of delivered in-app notifications their recipient acknowledged.' } },
    }),
    avg_response: f.string({
      texts: { label: 'Average response', doc: { summary: 'How long recipients took on average to acknowledge an in-app notification.' } },
    }),
    escalations: f.number({ texts: { label: 'Escalation pages', doc: { summary: 'Deliveries sent by escalation steps for unacknowledged incidents.' } } }),
  },
});

/** The figures of the facts block, in order. */
export const REPORT_FACT_ROWS = ['total', 'delivered', 'waiting', 'failed', 'dead_letter', 'ack_rate', 'avg_response', 'escalations'] as const;

/** The report's operations, for the module's registry. */
export const DELIVERY_REPORT_OPERATIONS = [deliveryReportOperation];
