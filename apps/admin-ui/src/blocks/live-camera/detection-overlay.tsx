import { cn } from '@burojs/ui-shadcn';
import type * as React from 'react';
import type { DetectionMessage } from '../../realtime/detections';
import { BOX_FILL, BOX_STROKE, boxKindOf, boxLabel } from './detection-label';
import type { LiveCameraT } from './live-camera-texts';

/**
 * Each box's own fade: a CSS animation (`@keyframes live-box-fade` in `src/styles.css`, opaque
 * for 1.5 s, then out over 0.5 s; its length is `BOX_LIFETIME_MS`) that starts when the box's
 * element is inserted, unlike an SVG `<animate>`, whose clock is the whole drawing's.
 */
export const BOX_FADE = 'animate-[live-box-fade_2s_linear_forwards]';

export interface DetectionOverlayProps {
  readonly boxes: readonly DetectionMessage[];
  readonly name: string;
  readonly t: LiveCameraT;
}

/**
 * The faces recognised on the video: one box per detection in the frame's own pixels, drawn on
 * an SVG with the frame's size laid over the video (both letterboxed the same way), labelled,
 * and fading out over the last half second of its two ({@link BOX_FADE}).
 */
export function DetectionOverlay({ boxes, name, t }: DetectionOverlayProps): React.ReactElement | null {
  const frame = boxes.at(-1);
  if (!frame) return null;
  const width = frame.frameWidth;
  const height = frame.frameHeight;
  const font = Math.max(12, Math.round(height / 28));
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
          <g
            key={message.detectionId}
            data-testid="live-box"
            data-kind={kind}
            className={BOX_FADE}
          >
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
