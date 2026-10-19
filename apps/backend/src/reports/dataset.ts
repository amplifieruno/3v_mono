import { z } from 'zod';

/** One table cell as computed by `itap.compute_report` (dates and times are pre-formatted text). */
export const cellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type Cell = z.infer<typeof cellSchema>;

/** The dataset `itap.compute_report` returns: one titled table plus summary items (spec §6.10). */
export const reportDatasetSchema = z.object({
  title: z.string(),
  code: z.string(),
  report_type: z.string(),
  period: z.object({
    start_date: z.string().nullable(),
    end_date: z.string().nullable(),
    timezone: z.string(),
  }),
  generated_at: z.string(),
  summary: z.array(z.object({ label: z.string(), value: cellSchema })),
  columns: z.array(z.string()).min(1),
  rows: z.array(z.array(cellSchema)),
  truncated: z.boolean(),
});
export type ReportDataset = z.infer<typeof reportDatasetSchema>;

export const REPORT_FORMATS = ['csv', 'json', 'pdf', 'xlsx'] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

/** Text of a cell for text formats (CSV, PDF). */
export function cellText(value: Cell): string {
  return value === null ? '' : String(value);
}

/** "From - to (timezone)" or "" for a report without a period. */
export function periodText(d: ReportDataset): string {
  const { start_date: from, end_date: to, timezone } = d.period;
  if (!from || !to) return '';
  return `${from === to ? from : `${from} - ${to}`} (${timezone})`;
}
