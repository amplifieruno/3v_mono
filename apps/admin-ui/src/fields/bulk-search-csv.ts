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
