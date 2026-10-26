import { AbsoluteFill, Series, useVideoConfig } from 'remotion';
import { sceneFrames } from '../durations';
import type { Scene } from '../scenes';
import type { Timeline } from '../timeline';
import { Grid } from './Grid';
import { SceneView } from './SceneView';

export interface VideoProps extends Record<string, unknown> {
  scenes: Scene[];
  timelines: Record<string, Timeline>;
}

/** The whole film: scenes back to back, each as long as its footage. */
export const Video = ({ scenes, timelines }: VideoProps): React.ReactElement => {
  const { fps } = useVideoConfig();
  // The grid sits under every scene, so fades between scenes pass through the grid, never black.
  return (
    <AbsoluteFill>
      <Grid />
      <Series>
        {scenes.map((s) => (
          <Series.Sequence key={s.id} durationInFrames={sceneFrames(s, timelines, fps)}>
            <SceneView scene={s} timelines={timelines} />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
