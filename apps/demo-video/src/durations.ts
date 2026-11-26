import { CARD_SECONDS } from './layout';
import type { Scene } from './scenes';
import { outputDuration, planSegments, type Timeline } from './timeline';
import { voicedSeconds, type VoiceManifest } from './voice';

/** Frames two beats overlap while one fades into the next. */
export const CROSSFADE_FRAMES = 15;

/** Frames of one beat: its footage with waits sped up, held longer when its narration needs the room. */
export function beatFrames(
  timeline: Timeline | undefined,
  fps: number,
  voice: VoiceManifest = {},
): number {
  const footage = timeline ? outputDuration(planSegments(timeline)) : 3;
  return Math.max(1, Math.round(voicedSeconds(footage, timeline && voice[timeline.clip]) * fps));
}

/** Frames of a scene: title and outro as long as their line needs (at least their fixed seconds); console scenes are the card plus their beats, minus the crossfades. */
export function sceneFrames(
  scene: Scene,
  timelines: Record<string, Timeline>,
  fps: number,
  voice: VoiceManifest = {},
): number {
  if (scene.kind !== 'console')
    return Math.round(voicedSeconds(scene.seconds, voice[scene.id]) * fps);
  const beats = scene.beats.map((b) => beatFrames(timelines[b.clip], fps, voice));
  return (
    CARD_SECONDS * fps + beats.reduce((a, b) => a + b, 0) - CROSSFADE_FRAMES * (beats.length - 1)
  );
}
