import { outputDuration, planSegments, type Timeline } from './timeline';

/** One narrated line as `voice/tts.py` wrote it: its length and when each sentence plays. */
export type VoiceLine = {
  duration: number;
  sentences: Array<{ text: string; start: number; end: number }>;
};

/** Lines by id: a beat's clip name, or `title` / `outro`. */
export type VoiceManifest = Record<string, VoiceLine>;

/** A line starts `lead` seconds into its beat, after the crossfade, and the beat runs `tail` seconds past it. */
export const VOICE = { lead: 0.7, tail: 1.1 } as const;

/** Seconds a beat lasts: its footage, or longer when its line needs the room. */
export function voicedSeconds(footage: number, line: VoiceLine | undefined): number {
  return line ? Math.max(footage, VOICE.lead + line.duration + VOICE.tail) : footage;
}

/** Seconds the recorder should keep filming so the footage covers the beat's line. */
export function holdSeconds(timeline: Timeline, line: VoiceLine | undefined): number {
  const out = outputDuration(planSegments(timeline));
  return Math.max(0, voicedSeconds(out, line) - out);
}

/** Seconds a subtitle stays up after its line ends. */
const LINGER = 0.4;

/** The sentence to subtitle `t` seconds into a line: the one being spoken, kept up through the pause that follows it. */
export function sentenceAt(line: VoiceLine, t: number): VoiceLine['sentences'][number] | undefined {
  const s = line.sentences;
  for (let i = 0; i < s.length; i++) {
    const until = i + 1 < s.length ? s[i + 1].start : s[i].end + LINGER;
    if (t >= s[i].start && t < until) return s[i];
  }
  return undefined;
}
