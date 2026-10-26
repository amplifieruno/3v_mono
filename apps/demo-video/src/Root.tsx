import { Composition, staticFile } from 'remotion';
import { Video, type VideoProps } from './components/Video';
import { sceneFrames } from './durations';
import { FPS, SCENES } from './scenes';
import { HEIGHT, WIDTH } from './style';
import type { Timeline } from './timeline';

/** Loads every recorded beat's timeline once, before rendering. A missing clip leaves its beat on the grid. */
const loadTimelines = async (): Promise<Record<string, Timeline>> => {
  const clips = SCENES.flatMap((s) => (s.kind === 'console' ? s.beats.map((b) => b.clip) : []));
  const entries = await Promise.all(
    clips.map(async (clip) => {
      const res = await fetch(staticFile(`clips/${clip}.timeline.json`));
      return res.ok ? ([clip, (await res.json()) as Timeline] as const) : null;
    }),
  );
  return Object.fromEntries(entries.filter((e) => e !== null));
};

export const RemotionRoot = (): React.ReactElement => (
  <Composition
    id="ItapDemo"
    component={Video}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
    durationInFrames={300}
    defaultProps={{ scenes: SCENES, timelines: {} } satisfies VideoProps}
    calculateMetadata={async ({ props }) => {
      const timelines = await loadTimelines();
      const durationInFrames = props.scenes.reduce(
        (sum, s) => sum + sceneFrames(s, timelines, FPS),
        0,
      );
      return { durationInFrames, props: { ...props, timelines } };
    }}
  />
);
