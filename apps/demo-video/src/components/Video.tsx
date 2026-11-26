import {
  AbsoluteFill,
  Html5Audio,
  interpolate,
  Series,
  staticFile,
  useVideoConfig,
} from 'remotion';
import { sceneFrames } from '../durations';
import type { Scene } from '../scenes';
import type { Timeline } from '../timeline';
import type { VoiceManifest } from '../voice';
import { Grid } from './Grid';
import { SceneView } from './SceneView';

export interface VideoProps extends Record<string, unknown> {
  scenes: Scene[];
  timelines: Record<string, Timeline>;
  voice: VoiceManifest;
  /** Whether `public/audio/music.mp3` exists: a quiet bed under the narration. */
  music: boolean;
}

/** Music level under the narration, and its fade in and out in seconds. */
const MUSIC = { volume: 0.14, fade: 2.5 } as const;

/** The whole film: scenes back to back, each as long as its footage and narration. */
export const Video = ({ scenes, timelines, voice, music }: VideoProps): React.ReactElement => {
  const { fps, durationInFrames } = useVideoConfig();
  const chapters = scenes.filter((s) => s.kind === 'console').length;
  const fade = MUSIC.fade * fps;
  // The grid sits under every scene, so fades between scenes pass through the grid, never black.
  return (
    <AbsoluteFill>
      <Grid />
      <Series>
        {scenes.map((s) => (
          <Series.Sequence key={s.id} durationInFrames={sceneFrames(s, timelines, fps, voice)}>
            <SceneView scene={s} timelines={timelines} voice={voice} chapters={chapters} />
          </Series.Sequence>
        ))}
      </Series>
      {music && (
        <Html5Audio
          src={staticFile('audio/music.mp3')}
          loop
          volume={(f) =>
            MUSIC.volume *
            interpolate(f, [0, fade, durationInFrames - fade, durationInFrames], [0, 1, 1, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })
          }
        />
      )}
    </AbsoluteFill>
  );
};
