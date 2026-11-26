import { Composition, staticFile } from 'remotion';
import { Video, type VideoProps } from './components/Video';
import { sceneFrames } from './durations';
import { FPS, SCENES } from './scenes';
import { HEIGHT, WIDTH } from './style';
import type { Timeline } from './timeline';
import type { VoiceManifest } from './voice';

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

/** The narration timing written by `voice/tts.py`; without it the film is silent. */
const loadVoice = async (): Promise<VoiceManifest> => {
  const res = await fetch(staticFile('voice/manifest.json'));
  return res.ok ? ((await res.json()) as VoiceManifest) : {};
};

const hasMusic = async (): Promise<boolean> =>
  (await fetch(staticFile('audio/music.mp3'), { method: 'HEAD' })).ok;

export const RemotionRoot = (): React.ReactElement => (
  <Composition
    id="ItapDemo"
    component={Video}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
    durationInFrames={300}
    defaultProps={{ scenes: SCENES, timelines: {}, voice: {}, music: false } satisfies VideoProps}
    calculateMetadata={async ({ props }) => {
      const [timelines, voice, music] = await Promise.all([
        loadTimelines(),
        loadVoice(),
        hasMusic(),
      ]);
      const durationInFrames = props.scenes.reduce(
        (sum, s) => sum + sceneFrames(s, timelines, FPS, voice),
        0,
      );
      return { durationInFrames, props: { ...props, timelines, voice, music } };
    }}
  />
);
