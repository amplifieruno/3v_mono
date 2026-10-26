import { AbsoluteFill, interpolate, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { CARD_SECONDS, FADE_FRAMES } from '../layout';
import type { Scene } from '../scenes';
import type { Timeline } from '../timeline';
import { ease } from '../style';
import { ChapterCard } from './ChapterCard';
import { ConsoleShot } from './ConsoleShot';
import { Grid } from './Grid';
import { Outro } from './Outro';
import { TitleBand } from './TitleBand';
import { TitleCard } from './TitleCard';

interface SceneViewProps {
  scene: Scene;
  timeline?: Timeline;
}

/** One storyboard scene, fading in from the grid. Console scenes open on their chapter card. */
export const SceneView = ({ scene, timeline }: SceneViewProps): React.ReactElement => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, FADE_FRAMES], [0, 1], { extrapolateRight: 'clamp' });
  if (scene.kind === 'title')
    return (
      <AbsoluteFill style={{ opacity }}>
        <TitleCard />
      </AbsoluteFill>
    );
  if (scene.kind === 'outro')
    return (
      <AbsoluteFill style={{ opacity }}>
        <Outro />
      </AbsoluteFill>
    );
  const card = CARD_SECONDS * fps;
  const total = scene.seconds * fps;
  const enter = interpolate(frame, [card, card + 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });
  return (
    <AbsoluteFill style={{ opacity }}>
      <Sequence durationInFrames={card + FADE_FRAMES}>
        <AbsoluteFill
          style={{
            opacity: interpolate(frame, [card, card + FADE_FRAMES], [1, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          <ChapterCard scene={scene} />
        </AbsoluteFill>
      </Sequence>
      <Sequence from={card}>
        <AbsoluteFill style={{ opacity: enter, transform: `translateY(${(1 - enter) * 60}px)` }}>
          <Grid>
            <TitleBand scene={scene} />
            {timeline && <ConsoleShot scene={scene} timeline={timeline} frames={total - card} />}
          </Grid>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
