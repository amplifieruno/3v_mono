import { cn } from '@burojs/ui-shadcn';
import type * as React from 'react';

/** One part of a stacked bar: its key, label, figure and colours (bar fill, legend swatch). */
export interface StackPart {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly fill: string;
  readonly swatch: string;
  /** What the legend writes instead of the label (an enum badge, say). */
  readonly legend?: React.ReactNode;
}

export interface StackedBarProps {
  readonly parts: readonly StackPart[];
  readonly ariaLabel: string;
  /** What the bar's full length stands for (default: the sum of its parts), so bars on one scale compare. */
  readonly total?: number;
  /** Write a legend (swatch, label, figure) under the bar. */
  readonly legend?: boolean;
  readonly testId: string;
}

const WIDTH = 480;
const HEIGHT = 12;

/**
 * Parts of a whole as one horizontal bar (statuses of the devices, severities of the open
 * incidents, outcomes of a channel's deliveries), a hover title per part and an optional legend.
 * Parts with nothing are left out of the bar but kept in the legend.
 */
export function StackedBar({ parts, ariaLabel, total, legend = false, testId }: StackedBarProps): React.ReactElement {
  const sum = parts.reduce((acc, part) => acc + part.value, 0);
  const scale = WIDTH / Math.max(total ?? sum, 1);
  let offset = 0;
  return (
    <div className="flex min-w-0 flex-col gap-1" data-testid={testId}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="h-3 w-full" role="img" aria-label={`${ariaLabel}: ${parts.map((part) => `${part.label} ${part.value}`).join(', ')}`}>
        <rect x={0} y={0} width={WIDTH} height={HEIGHT} rx={2} className="fill-muted" />
        {parts.map((part) => {
          if (part.value <= 0) return null;
          const x = offset;
          offset += part.value * scale;
          return (
            <rect key={part.key} data-testid={`${testId}-part`} data-part={part.key} x={x} y={0} width={part.value * scale} height={HEIGHT} className={part.fill}>
              <title>{`${part.label}: ${part.value}`}</title>
            </rect>
          );
        })}
      </svg>
      {legend ? (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {parts.map((part) => (
            <li key={part.key} className="flex items-center gap-1">
              <span aria-hidden className={cn('inline-block size-2 rounded-sm', part.swatch)} />
              <span>{part.legend ?? part.label}</span>
              <span className="font-medium tabular-nums text-foreground">{part.value}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
