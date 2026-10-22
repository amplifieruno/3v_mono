import { cn } from '@burojs/ui-shadcn';
import type * as React from 'react';
import type { DetectionMessage } from '../../realtime/detections';
import { BOX_FILL, BOX_STROKE, boxKindOf, boxLabel } from './detection-label';
import { BOX_LIFETIME_MS } from './use-detections';
import type { LiveCameraT } from './live-camera-texts';

export interface DetectionOverlayProps {
  readonly boxes: readonly DetectionMessage[];
  readonly name: string;
  readonly t: LiveCameraT;
}

/**
 * The faces recognised on the video: one box per detection in the frame's own pixels, drawn on
 * an SVG with the frame's size laid over the video (both letterboxed the same way), labelled,
 * and fading out over the last half second of its two.
 */
export function DetectionOverlay({ boxes, name, t }: DetectionOverlayProps): React.ReactElement | null {
  const frame = boxes.at(-1);
  if (!frame) return null;
  const width = frame.frameWidth;
  const height = frame.frameHeight;
  const font = Math.max(12, Math.round(height / 28));
  const seconds = BOX_LIFETIME_MS / 1000;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className="pointer-events-none absolute inset-0 size-full"
      role="img"
      aria-label={t('overlay', { params: { name } })}
    >
      {boxes.map((message) => {
        // A box of a frame of another size is scaled into this frame.
        const sx = width / message.frameWidth;
        const sy = height / message.frameHeight;
        const x = message.bbox.x * sx;
        const y = message.bbox.y * sy;
        const kind = boxKindOf(message);
        const label = boxLabel(message, t);
        const above = y - font * 0.4;
        return (
          <g key={message.detectionId} data-testid="live-box" data-kind={kind}>
            <animate
              attributeName="opacity"
              values="1;1;0"
              keyTimes="0;0.75;1"
              dur={`${seconds}s`}
              fill="freeze"
            />
            <title>
              {t('confidence', { params: { label, confidence: Math.round(message.confidence * 100) } })}
            </title>
            <rect
              x={x}
              y={y}
              width={message.bbox.width * sx}
              height={message.bbox.height * sy}
              rx={4}
              className={cn('fill-none stroke-[3]', BOX_STROKE[kind])}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={x}
              y={above > font ? above : y + message.bbox.height * sy + font}
              fontSize={font}
              strokeWidth={font / 5}
              paintOrder="stroke"
              className={cn('stroke-black/70 font-semibold', BOX_FILL[kind])}
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
