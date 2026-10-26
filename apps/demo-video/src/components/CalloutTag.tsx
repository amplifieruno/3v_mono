import { interpolate } from 'remotion';
import { C, ease, FONT } from '../style';

interface CalloutTagProps {
  text: string;
  /** The pointed-at spot, frame coordinates. */
  at: { x: number; y: number };
  /** Seconds since the callout appeared, and until it leaves. */
  age: number;
  left: number;
  /** Which way the tag goes from the spot; by default away from the frame centre. */
  side?: 'left' | 'right';
}

/** An accent mono tag joined by a drawn line to a spot on the footage. */
export const CalloutTag = ({ text, at, age, left, side }: CalloutTagProps): React.ReactElement => {
  const draw = interpolate(age, [0, 0.45], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });
  const pop = interpolate(age, [0.3, 0.65], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });
  const out = interpolate(left, [0, 0.35], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const len = side ? 70 : 170;
  // JetBrains Mono at 24 px is about 14.5 px a character, plus 28 px padding.
  const width = text.length * 14.5 + 28;
  const preferLeft = side ? side === 'left' : at.x > 960;
  const fitsLeft = at.x - len - width > 24;
  const fitsRight = at.x + len + width < 1896;
  const toLeft = preferLeft ? fitsLeft || !fitsRight : !fitsRight && fitsLeft;
  const lineX = toLeft ? at.x - len * draw : at.x;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: out }}>
      <div
        style={{
          position: 'absolute',
          left: at.x - 7,
          top: at.y - 7,
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: C.accent,
          boxShadow: '0 0 0 6px rgba(31,111,235,.2)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: lineX,
          top: at.y - 1,
          width: len * draw,
          height: 2,
          background: C.accent,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: at.y - 22,
          ...(toLeft ? { right: 1920 - (at.x - len) } : { left: at.x + len }),
          fontFamily: FONT.mono,
          fontSize: 24,
          fontWeight: 500,
          color: '#fff',
          background: C.accent,
          padding: '8px 14px',
          borderRadius: 4,
          whiteSpace: 'nowrap',
          opacity: pop,
          transform: `scale(${0.85 + 0.15 * pop})`,
          transformOrigin: toLeft ? 'right center' : 'left center',
          boxShadow: '0 8px 20px -8px rgba(15,27,45,.45)',
        }}
      >
        {text}
      </div>
    </div>
  );
};
