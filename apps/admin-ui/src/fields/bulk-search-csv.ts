/** A photo of a bulk face search: its uploaded `search` file and the label of its row. */
export interface BulkSearchPhoto {
  readonly id: string;
  readonly name: string;
}

/** One CSV cell (RFC 4180): quoted when it holds a comma, a quote or a line break. */
function cell(value: string): string {
  return /[",\r\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/**
 * The input file of a bulk face search (`apps/backend/src/bulk/columns.ts`): the header
 * `image_file_id,label`, then one row per photo, the file name as its label.
 */
export function bulkSearchCsv(photos: readonly BulkSearchPhoto[]): string {
  return ['image_file_id,label', ...photos.map((photo) => `${photo.id},${cell(photo.name)}`)].join('\r\n') + '\r\n';
}

/** The cells of a CSV text (RFC 4180: quoted cells, doubled quotes, CRLF or LF rows). */
function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(value);
      value = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      rows.push([...row, value]);
      row = [];
      value = '';
    } else value += char;
  }
  if (value !== '' || row.length > 0) rows.push([...row, value]);
  return rows;
}

/** The photos of a CSV written by {@link bulkSearchCsv}, back from its text (rows without an id are left out). */
export function parseBulkSearchCsv(text: string): BulkSearchPhoto[] {
  return csvRows(text)
    .slice(1)
    .filter((cells) => (cells[0] ?? '').trim() !== '')
    .map((cells) => ({ id: (cells[0] ?? '').trim(), name: cells[1] ?? '' }));
}
