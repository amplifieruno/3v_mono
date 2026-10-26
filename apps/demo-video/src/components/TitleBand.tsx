import type { ConsoleScene } from '../scenes';
import { C, FONT } from '../style';
import { PANEL } from '../layout';

interface TitleBandProps {
  scene: ConsoleScene;
}

/** The small chapter reminder above the footage. */
export const TitleBand = ({ scene }: TitleBandProps): React.ReactElement => (
  <div
    style={{
      position: 'absolute',
      left: PANEL.x,
      top: 48,
      display: 'flex',
      alignItems: 'baseline',
      gap: 22,
    }}
  >
    <span style={{ fontFamily: FONT.mono, fontSize: 22, color: C.accent, fontWeight: 500 }}>
      [{String(scene.chapter).padStart(2, '0')}] {scene.label}
    </span>
    <span
      style={{
        fontFamily: FONT.ui,
        fontSize: 34,
        fontWeight: 600,
        letterSpacing: '-0.03em',
        color: C.ink,
      }}
    >
      {scene.title}
    </span>
  </div>
);
