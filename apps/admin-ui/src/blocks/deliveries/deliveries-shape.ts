import type { StackPart } from '../charts/stacked-bar';
import type { ReportRow } from '../delivery-report/delivery-report-query';

/** The outcomes a channel's bar is cut into, in order, with their colours. */
export const DELIVERY_OUTCOMES = [
  { key: 'delivered', fill: 'fill-success', swatch: 'bg-success' },
  { key: 'sent', fill: 'fill-info', swatch: 'bg-info' },
  { key: 'pending', fill: 'fill-muted-foreground/40', swatch: 'bg-muted-foreground/40' },
  { key: 'failed', fill: 'fill-warning', swatch: 'bg-warning' },
  { key: 'dead_letter', fill: 'fill-destructive', swatch: 'bg-destructive' },
] as const satisfies readonly { key: keyof ReportRow; fill: string; swatch: string }[];

/** A channel's deliveries by outcome, labelled by `labelOf(outcome)`. */
export function outcomeParts(row: ReportRow, labelOf: (outcome: string) => string): StackPart[] {
  return DELIVERY_OUTCOMES.map((outcome) => ({
    key: outcome.key,
    label: labelOf(outcome.key),
    value: row[outcome.key],
    fill: outcome.fill,
    swatch: outcome.swatch,
  }));
}

/** The channels that had anything in the period, busiest first, and the largest total (the bars' common scale). */
export function activeChannels(rows: readonly ReportRow[]): { channels: ReportRow[]; scale: number } {
  const channels = rows.filter((row) => row.total > 0).sort((a, b) => b.total - a.total);
  return { channels, scale: Math.max(...channels.map((row) => row.total), 1) };
}
