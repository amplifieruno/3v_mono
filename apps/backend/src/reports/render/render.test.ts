import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { ReportDataset } from '../dataset.js';
import { renderCsv } from './csv.js';
import { renderReportFile } from './index.js';
import { renderJson } from './json.js';
import { renderPdf } from './pdf.js';
import { renderXlsx } from './xlsx.js';
import { crc32 } from './zip.js';

const dataset: ReportDataset = {
  title: 'Occupancy 2026-10-18',
  code: 'REPORT-00001',
  report_type: 'occupancy',
  period: { start_date: '2026-10-18', end_date: '2026-10-18', timezone: 'UTC' },
  generated_at: '2026-10-19 07:00',
  summary: [
    { label: 'Total visits', value: 42 },
    { label: 'Note', value: 'Snapshot, "quoted"' },
  ],
  columns: ['Facility', 'Day', 'Visitors', 'Share'],
  rows: [
    ['Nova Tower', '2026-10-18', 17, 12.5],
    ['Annex, "B"', '2026-10-18', 0, null],
    ['=cmd|calc', 'Zürich – ü', -3, true],
    ['-', '-1+1', '@x', 'a-b'],
  ],
  truncated: false,
};

describe('renderCsv', () => {
  it('should write a header and RFC 4180 quoted rows', () => {
    const text = renderCsv(dataset).toString('utf8');
    const lines = text.split('\r\n');
    expect(lines[0]).toBe('Facility,Day,Visitors,Share');
    expect(lines[1]).toBe('Nova Tower,2026-10-18,17,12.5');
    expect(lines[2]).toBe('"Annex, ""B""",2026-10-18,0,');
    expect(lines.at(-1)).toBe('');
  });

  it('should neutralise spreadsheet formulas in text cells but keep negative numbers', () => {
    const lines = renderCsv(dataset).toString('utf8').split('\r\n');
    expect(lines[3]).toBe("'=cmd|calc,Zürich – ü,-3,true");
    // A lone dash placeholder stays; a dash followed by a digit or letter could start a formula.
    expect(lines[4]).toBe("-,'-1+1,'@x,a-b");
  });
});

describe('renderJson', () => {
  it('should write rows as objects keyed by column', () => {
    const parsed = JSON.parse(renderJson(dataset).toString('utf8')) as Record<string, unknown>;
    expect(parsed.title).toBe(dataset.title);
    expect(parsed.summary).toEqual(dataset.summary);
    expect((parsed.rows as unknown[])[0]).toEqual({ Facility: 'Nova Tower', Day: '2026-10-18', Visitors: 17, Share: 12.5 });
    expect(parsed.columns).toEqual(dataset.columns);
  });
});

/** Byte offsets in the xref table must point at `<n> 0 obj`. */
function checkPdfXref(pdf: Buffer): number {
  const text = pdf.toString('latin1');
  expect(text.startsWith('%PDF-1.4')).toBe(true);
  expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  const startxref = Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(text)?.[1]);
  expect(text.slice(startxref, startxref + 4)).toBe('xref');
  const header = /xref\s+0 (\d+)\s+/.exec(text.slice(startxref));
  const count = Number(header?.[1]);
  const entries = text.slice(startxref + (header?.[0].length ?? 0)).split(/\r?\n/).slice(0, count);
  expect(entries[0]).toMatch(/^0000000000 65535 f/);
  for (let n = 1; n < count; n += 1) {
    const offset = Number(entries[n].slice(0, 10));
    expect(text.slice(offset, offset + `${n} 0 obj`.length)).toBe(`${n} 0 obj`);
  }
  expect(text).toMatch(new RegExp(`trailer\\s*<<\\s*/Size ${count} /Root 1 0 R\\s*>>`));
  return count;
}

describe('renderPdf', () => {
  it('should produce a PDF whose xref offsets point at its objects', () => {
    const pdf = renderPdf(dataset);
    checkPdfXref(pdf);
    const text = pdf.toString('latin1');
    expect(text).toContain('/BaseFont /Helvetica-Bold');
    expect(text).toContain('(Occupancy 2026-10-18) Tj');
    expect(text).toContain('Annex, "B"');
    expect(renderPdf({ ...dataset, title: 'a (b) \\c' }).toString('latin1')).toContain('(a \\(b\\) \\\\c) Tj');
    // Non-Latin-1 characters are replaced, Latin-1 kept (as WinAnsi bytes).
    expect(text).toContain('Zürich ? ü');
  });

  it('should split long tables into several pages with stream lengths that match', () => {
    const rows = Array.from({ length: 130 }, (_, i) => [`Area ${i}`, '2026-10-18', i, i / 2]);
    const pdf = renderPdf({ ...dataset, rows });
    checkPdfXref(pdf);
    const text = pdf.toString('latin1');
    const pages = Number(/\/Count (\d+)/.exec(text)?.[1]);
    expect(pages).toBeGreaterThanOrEqual(3);
    for (const m of text.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
      const start = (m.index ?? 0) + m[0].length;
      expect(text.slice(start + Number(m[1]), start + Number(m[1]) + '\nendstream'.length)).toBe('\nendstream');
    }
    expect(text).toContain('(Area 129');
  });
});

type ZipEntry = { name: string; data: Buffer };

/** Reads a ZIP through its central directory, inflating and CRC-checking every entry. */
function readZip(zip: Buffer): ZipEntry[] {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(eocd).toBeGreaterThan(0);
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    expect(zip.readUInt32LE(p)).toBe(0x02014b50);
    const method = zip.readUInt16LE(p + 10);
    const crc = zip.readUInt32LE(p + 16);
    const size = zip.readUInt32LE(p + 24);
    const nameLength = zip.readUInt16LE(p + 28);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nameLength).toString('utf8');
    expect(zip.readUInt32LE(local)).toBe(0x04034b50);
    const localName = zip.readUInt16LE(local + 26);
    const extra = zip.readUInt16LE(local + 28);
    const compressed = zip.readUInt32LE(local + 18);
    const raw = zip.subarray(local + 30 + localName + extra, local + 30 + localName + extra + compressed);
    const data = method === 8 ? inflateRawSync(raw) : raw;
    expect(data.length).toBe(size);
    expect(crc32(data)).toBe(crc);
    entries.push({ name, data });
    p += 46 + nameLength + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
  }
  return entries;
}

describe('renderXlsx', () => {
  it('should zip a minimal workbook with one sheet of inline strings and numbers', () => {
    const entries = readZip(renderXlsx(dataset));
    expect(entries.map((e) => e.name).sort()).toEqual([
      '[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml',
    ]);
    const sheet = entries.find((e) => e.name === 'xl/worksheets/sheet1.xml')?.data.toString('utf8') ?? '';
    expect(sheet).toContain('<c r="A1" t="inlineStr"><is><t>Occupancy 2026-10-18</t></is></c>');
    expect(sheet).toContain('<c r="C7"><v>17</v></c>');
    expect(sheet).toContain('<t>Annex, &quot;B&quot;</t>');
    expect(sheet).toContain('<t>=cmd|calc</t>');
    expect(sheet).not.toContain('<f>');
    const workbook = entries.find((e) => e.name === 'xl/workbook.xml')?.data.toString('utf8') ?? '';
    expect(workbook).toContain('<sheet name="Report" sheetId="1" r:id="rId1"/>');
  });

  it('should compute the standard CRC-32', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });
});

describe('renderReportFile', () => {
  it('should map each format to its renderer, mime type and extension', () => {
    expect(renderReportFile(dataset, 'csv')).toMatchObject({ mimeType: 'text/csv', extension: 'csv' });
    expect(renderReportFile(dataset, 'json')).toMatchObject({ mimeType: 'application/json', extension: 'json' });
    expect(renderReportFile(dataset, 'pdf')).toMatchObject({ mimeType: 'application/pdf', extension: 'pdf' });
    expect(renderReportFile(dataset, 'xlsx')).toMatchObject({
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      extension: 'xlsx',
    });
  });
});
