import { cellText, periodText, type ReportDataset } from '../dataset.js';

/**
 * Minimal PDF 1.4 writer (no dependency; spec: "PDF simple"): A4 landscape text pages with the standard Type 1 fonts
 * Helvetica(-Bold) for the header and Courier for a fixed-width table. Text is WinAnsi: characters outside Latin-1
 * become `?`. Long tables continue on further pages (header repeated); cells wider than 40 characters are cut.
 */

const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const MARGIN = 40;
const TABLE_SIZE = 7;
const LINE = 9;
/** Courier advance is 0.6 em. */
const TABLE_CHARS = Math.floor((PAGE_WIDTH - 2 * MARGIN) / (TABLE_SIZE * 0.6));
const MAX_CELL = 40;
const GAP = 2;

type Line = { font: 'F1' | 'F2' | 'F3'; size: number; text: string; gapAfter?: number };

function pdfText(text: string): string {
  const latin1 = [...text].map((ch) => {
    const code = ch.codePointAt(0) ?? 63;
    if (code < 32) return ' ';
    return code > 0xff ? '?' : ch;
  });
  return latin1.join('').replace(/[\\()]/g, (c) => `\\${c}`);
}

function columnWidths(d: ReportDataset): number[] {
  const widths = d.columns.map((c, i) =>
    Math.min(MAX_CELL, Math.max(c.length, ...d.rows.map((r) => cellText(r[i] ?? null).length))),
  );
  while (widths.reduce((a, b) => a + b, 0) + GAP * (widths.length - 1) > TABLE_CHARS) {
    const widest = widths.indexOf(Math.max(...widths));
    if (widths[widest] <= 4) break;
    widths[widest] -= 1;
  }
  return widths;
}

function tableLine(cells: string[], widths: number[]): string {
  return cells
    .map((c, i) => (c.length > widths[i] ? `${c.slice(0, Math.max(0, widths[i] - 1))}~` : c.padEnd(widths[i])))
    .join(' '.repeat(GAP))
    .trimEnd();
}

/** Lines of every page: the header block on page 1, the table header repeated on each page. */
function paginate(d: ReportDataset): Line[][] {
  const widths = columnWidths(d);
  const head: Line[] = [
    { font: 'F3', size: TABLE_SIZE, text: tableLine(d.columns, widths) },
    { font: 'F3', size: TABLE_SIZE, text: widths.map((w) => '-'.repeat(w)).join(' '.repeat(GAP)) },
  ];
  const meta = [d.code, periodText(d), `generated ${d.generated_at}`].filter(Boolean).join('  |  ');
  const first: Line[] = [
    { font: 'F1', size: 14, text: d.title, gapAfter: 6 },
    { font: 'F2', size: 9, text: meta, gapAfter: 4 },
    ...d.summary.map((s): Line => ({ font: 'F2', size: 9, text: `${s.label}: ${cellText(s.value)}` })),
  ];
  if (d.truncated) first.push({ font: 'F2', size: 9, text: 'Table truncated (row limit reached).' });
  first[first.length - 1] = { ...first[first.length - 1], gapAfter: 10 };

  const capacity = Math.floor((PAGE_HEIGHT - 2 * MARGIN) / LINE);
  const pages: Line[][] = [];
  let page: Line[] = [...first, ...head];
  let used = first.length + 3 + head.length;
  for (const row of d.rows) {
    if (used >= capacity) {
      pages.push(page);
      page = [...head];
      used = head.length;
    }
    page.push({ font: 'F3', size: TABLE_SIZE, text: tableLine(row.map((c) => cellText(c)), widths) });
    used += 1;
  }
  if (d.rows.length === 0) page.push({ font: 'F2', size: 9, text: 'No data for this period.' });
  pages.push(page);
  return pages;
}

function contentStream(lines: Line[], pageNo: number, pageCount: number): string {
  let y = PAGE_HEIGHT - MARGIN;
  const ops = lines.map((l) => {
    const op = `BT /${l.font} ${l.size} Tf ${MARGIN} ${y.toFixed(1)} Td (${pdfText(l.text)}) Tj ET`;
    y -= Math.max(LINE, l.size + 2) + (l.gapAfter ?? 0);
    return op;
  });
  ops.push(`BT /F2 8 Tf ${PAGE_WIDTH - MARGIN - 60} ${MARGIN / 2} Td (Page ${pageNo} of ${pageCount}) Tj ET`);
  return ops.join('\n');
}

export function renderPdf(d: ReportDataset): Buffer {
  const pages = paginate(d);
  const objects: string[] = [];
  const pageIds = pages.map((_, i) => 6 + 2 * i);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  const font = (name: string) => `<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`;
  objects[3] = font('Helvetica-Bold');
  objects[4] = font('Helvetica');
  objects[5] = font('Courier');
  pages.forEach((lines, i) => {
    const content = contentStream(lines, i + 1, pages.length);
    objects[pageIds[i]] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`;
    objects[pageIds[i] + 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });

  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets: number[] = [];
  for (let n = 1; n < objects.length; n += 1) {
    offsets[n] = out.length;
    out += `${n} 0 obj\n${objects[n]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let n = 1; n < objects.length; n += 1) out += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Every character is <= 0xFF (pdfText), so string offsets equal byte offsets.
  return Buffer.from(out, 'latin1');
}
