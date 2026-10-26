import { Series, useVideoConfig } from 'remotion';
import type { Scene } from '../scenes';
import type { Timeline } from '../timeline';
import { SceneView } from './SceneView';

export interface VideoProps extends Record<string, unknown> {
  scenes: Scene[];
  timelines: Record<string, Timeline>;
}

/** The whole film: scenes back to back. */
export const Video = ({ scenes, timelines }: VideoProps): React.ReactElement => {
  const { fps } = useVideoConfig();
  return (
    <Series>
      {scenes.map((s) => (
        <Series.Sequence key={s.id} durationInFrames={s.seconds * fps}>
          <SceneView scene={s} timeline={s.kind === 'console' ? timelines[s.clip] : undefined} />
        </Series.Sequence>
      ))}
    </Series>
  );
};
