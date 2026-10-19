import { cellText, type Cell, type ReportDataset } from '../dataset.js';

/**
 * Text that a spreadsheet could read as a formula is prefixed with `'` (CSV injection): starting with = + @ tab CR,
 * or a dash followed by a digit or letter (a lone `-` placeholder stays). Numbers stay numbers.
 */
function csvCell(value: Cell): string {
  let text = cellText(value);
  if (typeof value === 'string' && /^([=+@\t\r]|-[0-9A-Za-z])/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 CSV (UTF-8, CRLF) of the given lines (the first one is usually the header). */
export function formatCsv(lines: Cell[][]): Buffer {
  return Buffer.from(`${lines.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`, 'utf8');
}

/** RFC 4180 CSV (UTF-8, CRLF): header row of column labels, then the data rows. */
export function renderCsv(d: ReportDataset): Buffer {
  return formatCsv([d.columns, ...d.rows]);
}
