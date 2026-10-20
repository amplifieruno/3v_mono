import type { Cell, ReportDataset } from '../reports/dataset.js';
import { formatCsv } from '../reports/render/csv.js';
import { renderXlsx } from '../reports/render/xlsx.js';

/**
 * Export files with the slice-7 writers: CSV (RFC 4180, formula-injection guard), XLSX (one sheet, never formulas)
 * and a JSON document of the raw rows. Objects / arrays (jsonb columns) are JSON text in CSV / XLSX cells.
 */

export type ExportFormat = 'csv' | 'json' | 'xlsx';
export type ExportMeta = { code: string; name: string; entity: string; generatedAt: string; truncated: boolean };
export type ExportFile = { data: Buffer; mimeType: string; extension: ExportFormat };

function cell(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return JSON.stringify(value);
}

export function isExportFormat(value: string): value is ExportFormat {
  return value === 'csv' || value === 'json' || value === 'xlsx';
}

export function renderExport(format: ExportFormat, columns: string[], rows: Record<string, unknown>[], meta: ExportMeta): ExportFile {
  if (format === 'json') {
    const doc = {
      code: meta.code,
      name: meta.name,
      entity: meta.entity,
      generated_at: meta.generatedAt,
      row_count: rows.length,
      truncated: meta.truncated,
      columns,
      rows: rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c] ?? null]))),
    };
    return { data: Buffer.from(`${JSON.stringify(doc, null, 2)}\n`, 'utf8'), mimeType: 'application/json', extension: 'json' };
  }
  const lines: Cell[][] = rows.map((r) => columns.map((c) => cell(r[c])));
  if (format === 'csv') return { data: formatCsv([columns, ...lines]), mimeType: 'text/csv', extension: 'csv' };
  const dataset: ReportDataset = {
    title: meta.name,
    code: meta.code,
    report_type: 'export',
    period: { start_date: null, end_date: null, timezone: 'UTC' },
    generated_at: meta.generatedAt,
    summary: [
      { label: 'Entity', value: meta.entity },
      { label: 'Rows', value: rows.length },
      ...(meta.truncated ? [{ label: 'Truncated', value: true }] : []),
    ],
    columns: columns.length > 0 ? columns : ['(no columns)'],
    rows: lines,
    truncated: meta.truncated,
  };
  return {
    data: renderXlsx(dataset),
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx',
  };
}
