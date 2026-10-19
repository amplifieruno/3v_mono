import type { ReportDataset } from '../dataset.js';

/** JSON document: report header, summary items and the rows as objects keyed by column label. */
export function renderJson(d: ReportDataset): Buffer {
  const rows = d.rows.map((row) => Object.fromEntries(d.columns.map((c, i) => [c, row[i] ?? null])));
  const doc = {
    title: d.title,
    code: d.code,
    report_type: d.report_type,
    period: d.period,
    generated_at: d.generated_at,
    summary: d.summary,
    columns: d.columns,
    rows,
    truncated: d.truncated,
  };
  return Buffer.from(`${JSON.stringify(doc, null, 2)}\n`, 'utf8');
}
