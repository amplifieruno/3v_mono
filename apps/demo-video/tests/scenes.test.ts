import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { BANNED, onScreenTexts } from '../src/content-rules';
import { CROSSFADE_FRAMES, sceneFrames } from '../src/durations';
import { SCENES } from '../src/scenes';
import type { Timeline } from '../src/timeline';

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : path.endsWith('.ts') ? [path] : [];
  });
}

const clip = (duration: number): Timeline => ({ clip: 'x', duration, marks: [] });

test('no technology words on screen', () => {
  for (const text of onScreenTexts(SCENES)) for (const re of BANNED) expect(text).not.toMatch(re);
});

test('the banned list catches a tech word', () => {
  expect(BANNED.some((re) => re.test('Matched with pgvector'))).toBe(true);
  expect(BANNED.some((re) => re.test('5 SQL functions'))).toBe(true);
});

test('every console scene has beats with unique clips named after it', () => {
  const clips = SCENES.flatMap((s) => (s.kind === 'console' ? s.beats.map((b) => b.clip) : []));
  expect(new Set(clips).size).toBe(clips.length);
  for (const s of SCENES) {
    if (s.kind !== 'console') continue;
    expect(s.beats.length).toBeGreaterThan(0);
    for (const b of s.beats) expect(b.clip.startsWith(`${s.id}-`)).toBe(true);
  }
});

test('a console scene lasts its card plus its beats, minus the crossfades', () => {
  const scene = SCENES.find((s) => s.kind === 'console' && s.beats.length === 2);
  if (!scene || scene.kind !== 'console') throw new Error('need a two-beat scene');
  const timelines = Object.fromEntries(scene.beats.map((b) => [b.clip, clip(5)]));
  expect(sceneFrames(scene, timelines, 30)).toBe(60 + 150 + 150 - CROSSFADE_FRAMES);
});

test('title and outro keep their fixed length', () => {
  expect(sceneFrames(SCENES[0], {}, 30)).toBe(
    SCENES[0].kind === 'title' ? SCENES[0].seconds * 30 : -1,
  );
});

test('recording scripts hold no record ids', () => {
  const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  for (const f of filesUnder('record')) expect(readFileSync(f, 'utf8')).not.toMatch(uuid);
});
