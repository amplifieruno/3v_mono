import { cellText, type Cell, type ReportDataset } from '../dataset.js';

/**
 * Text that a spreadsheet could read as a formula is prefixed with `'` (CSV injection): starting with = + @ tab CR,
 * or with a dash unless the whole text is a plain decimal number (`-1.5` stays; `-(1+1)`, `--x` and a lone `-` are
 * prefixed). Number cells stay numbers.
 */
function csvCell(value: Cell): string {
  let text = cellText(value);
  if (typeof value === 'string' && (/^[=+@\t\r]/.test(text) || (text.startsWith('-') && !/^-?\d+(\.\d+)?$/.test(text)))) {
    text = `'${text}`;
  }
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
