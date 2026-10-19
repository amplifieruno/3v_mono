import { cellText, type Cell, type ReportDataset } from '../dataset.js';

/** Text starting like a spreadsheet formula is prefixed with `'` (CSV injection); numbers stay numbers. */
function csvCell(value: Cell): string {
  let text = cellText(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 CSV (UTF-8, CRLF): header row of column labels, then the data rows. */
export function renderCsv(d: ReportDataset): Buffer {
  const lines = [d.columns, ...d.rows].map((row) => row.map(csvCell).join(','));
  return Buffer.from(`${lines.join('\r\n')}\r\n`, 'utf8');
}
