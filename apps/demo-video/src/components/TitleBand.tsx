import type { ConsoleScene } from '../scenes';
import { C, FONT } from '../style';
import { BAND_Y, PANEL } from '../layout';
import { ProgressRail } from './ProgressRail';

interface TitleBandProps {
  scene: ConsoleScene;
  chapters: number;
  /** How far through this chapter the film is, 0..1. */
  progress: number;
}

/** The chapter reminder above the footage, with the film's progress on the right. */
export const TitleBand = ({ scene, chapters, progress }: TitleBandProps): React.ReactElement => (
  <div
    style={{
      position: 'absolute',
      left: PANEL.x,
      width: PANEL.w,
      top: BAND_Y,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 20 }}>
      <span style={{ fontFamily: FONT.mono, fontSize: 20, color: C.accent, fontWeight: 500 }}>
        [{String(scene.chapter).padStart(2, '0')}] {scene.label}
      </span>
      <span
        style={{
          fontFamily: FONT.ui,
          fontSize: 30,
          fontWeight: 600,
          letterSpacing: '-0.03em',
          color: C.ink,
        }}
      >
        {scene.title}
      </span>
    </div>
    <ProgressRail chapter={scene.chapter} total={chapters} progress={progress} />
  </div>
);
