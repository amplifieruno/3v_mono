import { periodText, type Cell, type ReportDataset } from '../dataset.js';
import { zip } from './zip.js';

/**
 * Minimal XLSX (OOXML) writer: one worksheet "Report" with inline strings (no shared strings, no styles, never
 * formulas: text starting with `=` stays text). Rows: title, period, summary items, a blank row, the column header,
 * then the data rows.
 */

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function xmlText(text: string): string {
  return text
    .replace(/[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

function cell(ref: string, value: Cell): string {
  if (value === null) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
  if (typeof value === 'boolean') return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
  const text = String(value);
  const space = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : '';
  return `<c r="${ref}" t="inlineStr"><is><t${space}>${xmlText(text)}</t></is></c>`;
}

function sheetXml(d: ReportDataset): string {
  const rows: Cell[][] = [
    [d.title],
    [[d.code, periodText(d)].filter(Boolean).join('  ')],
    ...d.summary.map((s): Cell[] => [s.label, s.value]),
    [],
    d.columns,
    ...d.rows,
  ];
  const body = rows
    .map((row, r) => `<row r="${r + 1}">${row.map((v, c) => cell(`${columnName(c)}${r + 1}`, v)).join('')}</row>`)
    .join('');
  return `${XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

const CONTENT_TYPES = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\
<Default Extension="xml" ContentType="application/xml"/>\
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>\
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>\
</Types>`;
const ROOT_RELS = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>\
</Relationships>`;
const WORKBOOK = `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" \
xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\
<sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>`;
const WORKBOOK_RELS = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>\
</Relationships>`;

export function renderXlsx(d: ReportDataset): Buffer {
  const file = (name: string, text: string) => ({ name, data: Buffer.from(text, 'utf8') });
  return zip([
    file('[Content_Types].xml', CONTENT_TYPES),
    file('_rels/.rels', ROOT_RELS),
    file('xl/workbook.xml', WORKBOOK),
    file('xl/_rels/workbook.xml.rels', WORKBOOK_RELS),
    file('xl/worksheets/sheet1.xml', sheetXml(d)),
  ]);
}
