import { describe, expect, it } from 'vitest';
import { renderExport } from './render.js';

const meta = { code: 'EXP-00001', name: 'Profiles', entity: 'profiles', generatedAt: '2026-10-20T10:00:00.000Z', truncated: false };
const columns = ['first_name', 'id', 'custom_fields', 'is_active'];
const rows = [
  { first_name: '=SUM(A1)', id: 'p1', custom_fields: { badge: 7 }, is_active: true },
  { first_name: 'Ann', id: 'p2', custom_fields: {}, is_active: null },
];

describe('renderExport', () => {
  it('should write a guarded RFC 4180 CSV with JSON text for objects', () => {
    const file = renderExport('csv', columns, rows, meta);
    expect(file).toMatchObject({ mimeType: 'text/csv', extension: 'csv' });
    expect(file.data.toString('utf8')).toBe(
      `first_name,id,custom_fields,is_active\r\n'=SUM(A1),p1,"{""badge"":7}",true\r\nAnn,p2,{},\r\n`,
    );
  });

  it('should write a JSON document with the raw rows', () => {
    const doc = JSON.parse(renderExport('json', columns, rows, meta).data.toString('utf8'));
    expect(doc).toMatchObject({ code: 'EXP-00001', entity: 'profiles', row_count: 2, truncated: false, columns });
    expect(doc.rows[0].custom_fields).toEqual({ badge: 7 });
  });

  it('should write an XLSX workbook (zip) without formulas', () => {
    const file = renderExport('xlsx', columns, rows, meta);
    expect(file.extension).toBe('xlsx');
    expect(file.data.subarray(0, 2).toString('latin1')).toBe('PK');
  });
});
