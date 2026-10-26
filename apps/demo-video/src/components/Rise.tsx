import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { ease } from '../style';

type RiseProps = { delay?: number; children: React.ReactNode; style?: React.CSSProperties };

/** Text that rises in with a slight blur (the style's entrance). `delay` in seconds. */
export function Rise({ delay = 0, children, style }: RiseProps): React.ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = interpolate(frame, [delay * fps, (delay + 0.9) * fps], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });
  return (
    <div style={{ ...style, opacity: p, transform: `translateY(${(1 - p) * 40}px)`, filter: `blur(${(1 - p) * 6}px)` }}>
      {children}
    </div>
  );
}
