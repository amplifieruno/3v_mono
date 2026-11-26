import { C, FONT } from '../style';

interface ProgressRailProps {
  /** 1-based chapter shown now, out of `total`. */
  chapter: number;
  total: number;
  /** How far through this chapter the film is, 0..1. */
  progress: number;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** One segment per chapter: past ones filled, the current one filling, later ones outlined. */
export const ProgressRail = ({
  chapter,
  total,
  progress,
}: ProgressRailProps): React.ReactElement => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
    <div style={{ display: 'flex', gap: 6 }}>
      {Array.from({ length: total }, (_, i) => {
        const fill = i + 1 < chapter ? 1 : i + 1 === chapter ? progress : 0;
        return (
          <div
            key={i}
            style={{
              width: 34,
              height: 4,
              borderRadius: 2,
              background: 'rgba(31,111,235,.16)',
              overflow: 'hidden',
            }}
          >
            <div style={{ width: `${fill * 100}%`, height: '100%', background: C.accent }} />
          </div>
        );
      })}
    </div>
    <span style={{ fontFamily: FONT.mono, fontSize: 18, color: C.ink2, fontWeight: 500 }}>
      {pad(chapter)}/{pad(total)}
    </span>
  </div>
);
