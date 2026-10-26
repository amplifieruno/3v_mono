import type { ConsoleScene } from '../scenes';
import { C, FONT } from '../style';
import { Corners } from './Corners';
import { Grid } from './Grid';
import { Rise } from './Rise';

interface ChapterCardProps {
  scene: ConsoleScene;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Full-frame chapter opener: `[02] RECOGNITION` and the chapter title. */
export const ChapterCard = ({ scene }: ChapterCardProps): React.ReactElement => (
  <Grid>
    <Corners delay={0.2} />
    <div
      style={{
        position: 'absolute',
        left: 160,
        top: '50%',
        transform: 'translateY(-50%)',
        right: 160,
      }}
    >
      <Rise
        style={{
          fontFamily: FONT.mono,
          fontSize: 34,
          color: C.accent,
          fontWeight: 500,
          letterSpacing: '0.04em',
        }}
      >
        [{pad(scene.chapter)}] {scene.label}
      </Rise>
      <Rise
        delay={0.12}
        style={{
          fontFamily: FONT.ui,
          fontWeight: 600,
          fontSize: 112,
          letterSpacing: '-0.035em',
          lineHeight: 1.02,
          marginTop: 28,
          textWrap: 'balance',
        }}
      >
        {scene.title}
      </Rise>
    </div>
  </Grid>
);
