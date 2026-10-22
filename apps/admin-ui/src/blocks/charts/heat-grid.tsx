import { cn } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { HEAT_CLASSES, clip, formatFigure, heatLevel } from './chart-scale';

/** A row or a column of the grid: its key and its label. */
export interface HeatAxis {
  readonly key: string;
  readonly label: string;
  /** Written on an upright column instead of the label (`''` writes nothing); the label stays the hover text. */
  readonly short?: string;
}

export interface HeatGridProps {
  readonly rows: readonly HeatAxis[];
  readonly columns: readonly HeatAxis[];
  /** `cells[row][column]`; `null` = no figure. */
  readonly cells: readonly (readonly (number | null)[])[];
  /** The hover title of a cell. */
  readonly describe: (row: HeatAxis, column: HeatAxis, value: number | null) => string;
  readonly ariaLabel: string;
  /** Long column labels (area names) are written slanted; short ones (hours) upright. */
  readonly slantColumns?: boolean;
  /** Write each non-empty cell's figure in it. */
  readonly showValues?: boolean;
  readonly format?: (value: number) => string;
  readonly testId: string;
}

const LABEL_WIDTH = 132;
const CELL = 24;
const UPRIGHT_HEADER = 16;
const SLANTED_HEADER = 84;

/**
 * A matrix of figures as shaded cells (`HEAT_CLASSES`, darker = more, against the grid's largest
 * figure), rows labelled on the left and columns on top, a hover title per cell. Drawn at its own
 * size and shrunk to fit a narrow box, never stretched, so the labels stay readable.
 */
export function HeatGrid({
  rows,
  columns,
  cells,
  describe,
  ariaLabel,
  slantColumns = false,
  showValues = false,
  format = formatFigure,
  testId,
}: HeatGridProps): React.ReactElement {
  const header = slantColumns ? SLANTED_HEADER : UPRIGHT_HEADER;
  const width = LABEL_WIDTH + columns.length * CELL + (slantColumns ? 48 : 0);
  const height = header + rows.length * CELL;
  const max = Math.max(...cells.flat().map((value) => value ?? 0), 0);
  return (
    <div className="overflow-x-auto" data-testid={testId}>
      <svg viewBox={`0 0 ${width} ${height}`} width={width} className="h-auto max-w-full" role="img" aria-label={ariaLabel}>
        {columns.map((column, index) => {
          const x = LABEL_WIDTH + index * CELL + CELL / 2;
          return slantColumns ? (
            <text
              key={column.key}
              x={x}
              y={header - 6}
              transform={`rotate(-40 ${x} ${header - 6})`}
              className="fill-muted-foreground text-[10px]"
            >
              <title>{column.label}</title>
              {clip(column.label, 14)}
            </text>
          ) : (
            <text key={column.key} x={x} y={header - 5} textAnchor="middle" className="fill-muted-foreground text-[10px]">
              {column.short ?? column.label}
            </text>
          );
        })}
        {rows.map((row, rowIndex) => {
          const y = header + rowIndex * CELL;
          return (
            <g key={row.key}>
              <text x={LABEL_WIDTH - 6} y={y + CELL / 2 + 3} textAnchor="end" className="fill-foreground text-[11px]">
                <title>{row.label}</title>
                {clip(row.label, 20)}
              </text>
              {columns.map((column, columnIndex) => {
                const value = cells[rowIndex]?.[columnIndex] ?? null;
                const level = heatLevel(value, max);
                const x = LABEL_WIDTH + columnIndex * CELL;
                return (
                  <g key={column.key}>
                    <rect
                      data-testid={`${testId}-cell`}
                      data-level={level}
                      x={x + 1}
                      y={y + 1}
                      width={CELL - 2}
                      height={CELL - 2}
                      rx={3}
                      className={HEAT_CLASSES[level]}
                    >
                      <title>{describe(row, column, value)}</title>
                    </rect>
                    {showValues && value !== null && value > 0 ? (
                      <text
                        x={x + CELL / 2}
                        y={y + CELL / 2 + 3}
                        textAnchor="middle"
                        className={cn('pointer-events-none text-[9px]', level >= 4 ? 'fill-primary-foreground' : 'fill-foreground')}
                      >
                        {format(value)}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
