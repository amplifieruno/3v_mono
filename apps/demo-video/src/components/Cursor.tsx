import { interpolate } from 'remotion';
import type { Box, Mark } from '../timeline';
import { ease } from '../style';

interface CursorProps {
  marks: Mark[];
  /** Source second shown now. */
  t: number;
}

type Click = { t: number; box: Box };
const center = (b: Box): { x: number; y: number } => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** A drawn pointer gliding between the recorded clicks, with a ripple on each click. Page coordinates. */
export const Cursor = ({ marks, t }: CursorProps): React.ReactElement | null => {
  const clicks: Click[] = marks.filter(
    (m): m is Extract<Mark, { type: 'click' }> => m.type === 'click',
  );
  if (clicks.length === 0 || t < clicks[0].t - 0.9) return null;
  const i = clicks.findIndex((c) => c.t > t);
  const next = i === -1 ? null : clicks[i];
  const prev = i === -1 ? clicks.at(-1)! : clicks[i - 1];
  const to = next ? center(next.box) : center(prev.box);
  const from = prev ? center(prev.box) : { x: to.x + 220, y: to.y + 160 };
  const p = next
    ? interpolate(t, [next.t - 0.6, next.t - 0.05], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: ease,
      })
    : 1;
  const x = from.x + (to.x - from.x) * p;
  const y = from.y + (to.y - from.y) * p;
  const since = prev ? t - (prev.t + 0.4) : -1;
  const ripple = since >= 0 && since < 0.5 ? since / 0.5 : null;
  return (
    <>
      {ripple !== null && prev && (
        <div
          style={{
            position: 'absolute',
            left: center(prev.box).x - 30,
            top: center(prev.box).y - 30,
            width: 60,
            height: 60,
            borderRadius: '50%',
            border: '3px solid #1f6feb',
            transform: `scale(${0.4 + ripple})`,
            opacity: 1 - ripple,
          }}
        />
      )}
      <svg
        width="30"
        height="30"
        viewBox="0 0 24 24"
        style={{
          position: 'absolute',
          left: x - 4,
          top: y - 2,
          filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.3))',
        }}
      >
        <path
          d="M4 2 L4 19 L8.5 14.8 L11.6 21.5 L14.4 20.3 L11.4 13.8 L17.5 13.8 Z"
          fill="#0f1b2d"
          stroke="#ffffff"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    </>
  );
};
