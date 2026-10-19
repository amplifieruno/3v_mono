import type { ReportDataset, ReportFormat } from '../dataset.js';
import { renderCsv } from './csv.js';
import { renderJson } from './json.js';
import { renderPdf } from './pdf.js';
import { renderXlsx } from './xlsx.js';

export type RenderedFile = { data: Buffer; mimeType: string; extension: ReportFormat };

const RENDERERS: Record<ReportFormat, { render: (d: ReportDataset) => Buffer; mimeType: string }> = {
  csv: { render: renderCsv, mimeType: 'text/csv' },
  json: { render: renderJson, mimeType: 'application/json' },
  pdf: { render: renderPdf, mimeType: 'application/pdf' },
  xlsx: { render: renderXlsx, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
};

/** The report file in `format` (one renderer per format, spec §8.4 render_report). */
export function renderReportFile(d: ReportDataset, format: ReportFormat): RenderedFile {
  const r = RENDERERS[format];
  return { data: r.render(d), mimeType: r.mimeType, extension: format };
}
