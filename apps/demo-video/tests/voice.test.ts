import { describe, expect, it } from 'vitest';
import type { Timeline } from '../src/timeline';
import { holdSeconds, voicedSeconds, VOICE } from '../src/voice';

const line = { duration: 5, sentences: [{ text: 'Hi.', start: 0, end: 5 }] };

describe('voicedSeconds', () => {
  it('keeps footage that is longer than its line', () => {
    expect(voicedSeconds(9, line)).toBe(9);
  });
  it('stretches a beat to lead + line + tail', () => {
    expect(voicedSeconds(3, line)).toBeCloseTo(VOICE.lead + 5 + VOICE.tail);
  });
  it('leaves silent beats alone', () => {
    expect(voicedSeconds(4, undefined)).toBe(4);
  });
});

describe('holdSeconds', () => {
  const tl = (duration: number, waits: Array<[number, number]> = []): Timeline => ({
    clip: 'x',
    duration,
    marks: waits.flatMap(([a, b]) => [
      { t: a, type: 'wait_start' as const },
      { t: b, type: 'wait_end' as const },
    ]),
  });
  it('asks for the missing output seconds', () => {
    expect(holdSeconds(tl(4), line)).toBeCloseTo(VOICE.lead + 5 + VOICE.tail - 4);
  });
  it('counts sped-up waits at their output length', () => {
    // 6 s of waiting plays as 1 s, so 2 + 1 = 3 s of output.
    expect(holdSeconds(tl(8, [[1, 7]]), line)).toBeCloseTo(VOICE.lead + 5 + VOICE.tail - 3);
  });
  it('asks for nothing when the footage already covers the line', () => {
    expect(holdSeconds(tl(20), line)).toBe(0);
  });
});

describe('voiced scenes', () => {
  it('a beat with a long line outlasts its footage', async () => {
    const { beatFrames } = await import('../src/durations');
    const tl: Timeline = { clip: 'a-b', duration: 2, marks: [] };
    expect(beatFrames(tl, 30, { 'a-b': line })).toBe(
      Math.round((VOICE.lead + 5 + VOICE.tail) * 30),
    );
  });
  it('the title lasts as long as its line needs', async () => {
    const { sceneFrames } = await import('../src/durations');
    const title = { id: 'title' as const, kind: 'title' as const, seconds: 3 };
    expect(sceneFrames(title, {}, 30, { title: line })).toBe(
      Math.round((VOICE.lead + 5 + VOICE.tail) * 30),
    );
  });
});

describe('sentenceAt', () => {
  const two = {
    duration: 4,
    sentences: [
      { text: 'One.', start: 0, end: 1.5 },
      { text: 'Two.', start: 1.8, end: 4 },
    ],
  };
  it('shows the sentence being spoken', async () => {
    const { sentenceAt } = await import('../src/voice');
    expect(sentenceAt(two, 1)?.text).toBe('One.');
    expect(sentenceAt(two, 3)?.text).toBe('Two.');
  });
  it('keeps a sentence up through the pause after it', async () => {
    const { sentenceAt } = await import('../src/voice');
    expect(sentenceAt(two, 1.7)?.text).toBe('One.');
  });
  it('shows nothing before the line or well after it', async () => {
    const { sentenceAt } = await import('../src/voice');
    expect(sentenceAt(two, -0.5)).toBeUndefined();
    expect(sentenceAt(two, 5)).toBeUndefined();
  });
});
