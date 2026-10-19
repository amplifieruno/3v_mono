import { describe, expect, it } from 'vitest';
import { CsvError, parseCsv } from './csv.js';

describe('parseCsv', () => {
  it('should split records on CRLF or LF and fields on commas', () => {
    expect(parseCsv('a,b\r\n1,2\n3,4')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
  });

  it('should ignore a UTF-8 BOM and one trailing line break', () => {
    expect(parseCsv('﻿a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('should unquote fields with commas, doubled quotes and line breaks', () => {
    expect(parseCsv('name,note\r\n"Doe, Jane","say ""hi""\nthere"\r\n')).toEqual([
      ['name', 'note'],
      ['Doe, Jane', 'say "hi"\nthere'],
    ]);
  });

  it('should keep empty fields and blank lines as records', () => {
    expect(parseCsv('a,b\n,\n\nx,')).toEqual([['a', 'b'], ['', ''], [''], ['x', '']]);
  });

  it('should return no records for empty input', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('﻿')).toEqual([]);
  });

  it('should reject an unterminated quote and text after a closing quote', () => {
    expect(() => parseCsv('a\n"open')).toThrow(CsvError);
    expect(() => parseCsv('a\n"x"y')).toThrow(CsvError);
  });
});
