import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { Marks } from './marks';
import type { Beat, RecordedScene } from './scene';
import { overview } from './scenes/01-overview';
import { recognition } from './scenes/02-recognition';
import { people } from './scenes/03-people';
import { places } from './scenes/04-places';
import { access } from './scenes/05-access';
import { incidents } from './scenes/06-incidents';
import { analytics } from './scenes/07-analytics';
import { privacy } from './scenes/08-privacy';
import { openSession } from './session';

const ALL: RecordedScene[] = [
  overview,
  recognition,
  people,
  places,
  access,
  incidents,
  analytics,
  privacy,
];
const OUT = resolve(import.meta.dirname, '../public/clips');
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';

function probeSeconds(file: string): number {
  const out = spawnSync(FFMPEG, ['-i', file, '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const last = [...out.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].at(-1);
  if (!last) throw new Error(`cannot read the duration of ${file}`);
  return last.slice(1).reduce((sum, v, i) => sum + Number(v) * [3600, 60, 1][i], 0);
}

/** Prepares a beat off camera, then records only its visible part as `<scene>-<beat>.mp4` plus a timeline. */
async function recordBeat(page: Page, clip: string, beat: Beat): Promise<void> {
  await beat.prepare(page);
  const webm = join(OUT, `${clip}.webm`);
  const marks = new Marks(clip);
  await page.screencast.start({
    path: webm,
    size: { width: 1920, height: 1080 },
    quality: 100,
    fps: 30,
  });
  marks.start();
  await beat.record(page, marks);
  await page.screencast.stop();
  const mp4 = join(OUT, `${clip}.mp4`);
  execFileSync(FFMPEG, [
    '-v',
    'error',
    '-y',
    '-i',
    webm,
    '-r',
    '30',
    '-c:v',
    'libx264',
    '-crf',
    '12',
    '-pix_fmt',
    'yuv420p',
    mp4,
  ]);
  rmSync(webm);
  await marks.save(OUT, probeSeconds(mp4));
  process.stdout.write(`recorded ${clip}\n`);
}

/** `tsx record/run.ts [scene | scene-beat ...]`: everything by default. */
async function main(): Promise<void> {
  const wanted = process.argv.slice(2);
  const jobs = ALL.flatMap((s) =>
    s.beats.map((b) => ({ clip: `${s.id}-${b.id}`, scene: s.id, beat: b })),
  );
  // In the order asked for, so e.g. the floor plans can be recorded first.
  const picked = wanted.length
    ? wanted.flatMap((w) => jobs.filter((j) => j.scene === w || j.clip === w))
    : jobs;
  if (wanted.length && picked.length === 0)
    throw new Error(
      `nothing matches ${wanted.join(' ')}; known: ${jobs.map((j) => j.clip).join(', ')}`,
    );
  mkdirSync(OUT, { recursive: true });
  const { browser, page } = await openSession();
  try {
    for (const job of picked) await recordBeat(page, job.clip, job.beat);
  } finally {
    await browser.close();
  }
}

await main();
