import { CARD_SECONDS } from './layout';
import type { Scene } from './scenes';
import { outputDuration, planSegments, type Timeline } from './timeline';

/** Frames two beats overlap while one fades into the next. */
export const CROSSFADE_FRAMES = 15;

/** Frames of one beat: its footage with waits sped up, never re-timed otherwise. */
export function beatFrames(timeline: Timeline | undefined, fps: number): number {
  return timeline ? Math.max(1, Math.round(outputDuration(planSegments(timeline)) * fps)) : 3 * fps;
}

/** Frames of a scene: fixed for title and outro; the chapter card plus its beats, minus the crossfades, for console scenes. */
export function sceneFrames(
  scene: Scene,
  timelines: Record<string, Timeline>,
  fps: number,
): number {
  if (scene.kind !== 'console') return scene.seconds * fps;
  const beats = scene.beats.map((b) => beatFrames(timelines[b.clip], fps));
  return (
    CARD_SECONDS * fps + beats.reduce((a, b) => a + b, 0) - CROSSFADE_FRAMES * (beats.length - 1)
  );
}
