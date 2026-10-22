import { useT } from '@burojs/react';
import { cn } from '@burojs/ui-shadcn';
import * as React from 'react';
import { type PlanPoint, type PlanSize, toPlanPoint } from './plan-geometry';
import { usePresignedUrl } from './presigned-url';

export interface PlanCanvasProps {
  readonly size: PlanSize;
  /** The plan's image (a storage file); without one the plan is a blank sheet of its size. */
  readonly imageFileId: string | null;
  /** The accessible name of the drawing. */
  readonly label: string;
  /** A click on the plan (not on a handle that stopped it), in plan pixels. */
  readonly onPick?: (point: PlanPoint) => void;
  /** The pointer moving over the plan while a handle is dragged, in plan pixels. */
  readonly onDrag?: (point: PlanPoint) => void;
  /** The pointer released (or lost) while dragging. */
  readonly onDragEnd?: () => void;
  readonly className?: string;
  readonly testId?: string;
  readonly children?: React.ReactNode;
}

/**
 * A floor plan as one SVG in its own pixel space (`viewBox` = image size): the image, then
 * whatever the caller draws over it in plan coordinates. Pointer positions are turned into
 * plan pixels from the drawn box, so the plan can be shown at any width.
 */
export function PlanCanvas({
  size,
  imageFileId,
  label,
  onPick,
  onDrag,
  onDragEnd,
  className,
  testId,
  children,
}: PlanCanvasProps): React.ReactElement {
  const t = useT();
  const ref = React.useRef<SVGSVGElement | null>(null);
  const image = usePresignedUrl(imageFileId);
  const pointOf = (event: React.MouseEvent<SVGSVGElement>): PlanPoint | null =>
    ref.current ? toPlanPoint(event, ref.current.getBoundingClientRect(), size) : null;
  const imageUrl = image.data?.url;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <svg
        ref={ref}
        role="img"
        aria-label={label}
        data-testid={testId}
        viewBox={`0 0 ${size.width} ${size.height}`}
        className={cn(
          'h-auto w-full touch-none select-none rounded-md border bg-muted/30',
          onPick ? 'cursor-crosshair' : undefined,
        )}
        onClick={(event) => {
          const point = onPick ? pointOf(event) : null;
          if (point) onPick?.(point);
        }}
        onPointerMove={(event) => {
          const point = onDrag ? pointOf(event) : null;
          if (point) onDrag?.(point);
        }}
        onPointerUp={() => onDragEnd?.()}
        onPointerLeave={() => onDragEnd?.()}
      >
        {imageUrl ? (
          <image
            href={imageUrl}
            width={size.width}
            height={size.height}
            preserveAspectRatio="none"
          />
        ) : (
          <rect width={size.width} height={size.height} className="fill-background" />
        )}
        {children}
      </svg>
      {image.isError ? (
        <span className="text-xs text-destructive">{t('console.planCanvas.imageFailed')}</span>
      ) : null}
    </div>
  );
}
