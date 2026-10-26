import { AbsoluteFill, interpolate, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { beatFrames, CROSSFADE_FRAMES } from '../durations';
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
  timelines: Record<string, Timeline>;
}

interface FadeInProps {
  frames: number;
  children: React.ReactNode;
}

/** Fades its children in over `frames` (a crossfade when the previous beat is still playing beneath). */
const FadeIn = ({ frames, children }: FadeInProps): React.ReactElement => {
  const frame = useCurrentFrame();
  const opacity =
    frames > 0 ? interpolate(frame, [0, frames], [0, 1], { extrapolateRight: 'clamp' }) : 1;
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

/** One storyboard scene. Console scenes open on their chapter card, then cut between their beats with crossfades. */
export const SceneView = ({ scene, timelines }: SceneViewProps): React.ReactElement => {
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
  const enter = interpolate(frame, [card, card + 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });
  let at = 0;
  const beats = scene.beats.map((b, i) => {
    const frames = beatFrames(timelines[b.clip], fps);
    const from = i === 0 ? 0 : at - CROSSFADE_FRAMES;
    at = from + frames;
    return (
      <Sequence key={b.clip} from={from} durationInFrames={frames}>
        <FadeIn frames={i === 0 ? 0 : CROSSFADE_FRAMES}>
          {timelines[b.clip] && (
            <ConsoleShot beat={b} timeline={timelines[b.clip]} frames={frames} />
          )}
        </FadeIn>
      </Sequence>
    );
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
            {beats}
          </Grid>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
