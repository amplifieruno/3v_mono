import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@burojs/ui-shadcn';
import type * as React from 'react';

/** One row of a chart's data table: its key, its header cell and its figures, already written. */
export interface ChartTableRow {
  readonly key: string;
  readonly header: string;
  readonly cells: readonly string[];
}

export interface ChartTableProps {
  readonly caption: string;
  /** The header of the row-header column, then one per figure column. */
  readonly columns: readonly string[];
  readonly rows: readonly ChartTableRow[];
  readonly testId?: string;
}

/**
 * A chart's figures as a table for assistive technology (visually hidden): the drawing is one
 * image, so every point it shows on hover is also reachable here, row by row.
 */
export function ChartTable({ caption, columns, rows, testId }: ChartTableProps): React.ReactElement {
  return (
    <div className="sr-only" data-testid={testId}>
      <Table>
        <TableCaption>{caption}</TableCaption>
        <TableHeader>
          <TableRow>
            {columns.map((column, index) => (
              <TableHead key={`${index}:${column}`} scope="col">
                {column}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableHead scope="row">{row.header}</TableHead>
              {row.cells.map((cell, index) => (
                <TableCell key={`${row.key}:${index}`}>{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
