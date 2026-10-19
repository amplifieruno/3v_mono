/** Malformed CSV input (the bulk job fails with `csv_invalid: <reason>`). */
export class CsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvError';
  }
}

/**
 * RFC 4180 parser (no dependency): records separated by CRLF or LF, fields by commas, double-quoted fields may hold
 * commas, line breaks and doubled quotes. A leading UTF-8 BOM and one trailing line break are ignored; a blank line
 * is a record with one empty field (the caller decides what blank records mean).
 */
export function parseCsv(input: string): string[][] {
  const text = input.startsWith('﻿') ? input.slice(1) : input;
  const records: string[][] = [];
  if (text.length === 0) return records;
  let record: string[] = [];
  let field = '';
  let i = 0;
  const endRecord = () => {
    record.push(field);
    records.push(record);
    record = [];
    field = '';
  };
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' && field.length === 0) {
      // Quoted field: up to the closing quote, `""` is a literal quote.
      i += 1;
      for (;;) {
        if (i >= text.length) throw new CsvError(`unterminated quoted field in record ${records.length + 1}`);
        if (text[i] === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        field += text[i];
        i += 1;
      }
      const next = text[i];
      if (next !== undefined && next !== ',' && next !== '\n' && next !== '\r') {
        throw new CsvError(`text after a closing quote in record ${records.length + 1}`);
      }
      continue;
    }
    if (ch === ',') {
      record.push(field);
      field = '';
      i += 1;
    } else if (ch === '\r' && text[i + 1] === '\n') {
      endRecord();
      i += 2;
    } else if (ch === '\n') {
      endRecord();
      i += 1;
    } else {
      field += ch;
      i += 1;
    }
  }
  // The last record, unless the input ended with a line break.
  if (field.length > 0 || record.length > 0 || !/\r?\n$/.test(text)) endRecord();
  return records;
}
