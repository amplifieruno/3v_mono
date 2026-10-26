import { Composition, staticFile } from 'remotion';
import { Video, type VideoProps } from './components/Video';
import { FPS, SCENES, totalSeconds } from './scenes';
import { HEIGHT, WIDTH } from './style';
import type { Timeline } from './timeline';

/** Loads every recorded timeline once, before rendering. A missing clip leaves its scene on the grid. */
const loadTimelines = async (): Promise<Record<string, Timeline>> => {
  const entries = await Promise.all(
    SCENES.flatMap((s) => (s.kind === 'console' ? [s.clip] : [])).map(async (clip) => {
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
    durationInFrames={totalSeconds(SCENES) * FPS}
    defaultProps={{ scenes: SCENES, timelines: {} } satisfies VideoProps}
    calculateMetadata={async ({ props }) => ({
      props: { ...props, timelines: await loadTimelines() },
    })}
  />
);
