import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Marks } from './marks';
import type { RecordedScene } from './scene';
import { overview } from './scenes/01-overview';
import { recognition } from './scenes/02-recognition';
import { people } from './scenes/03-people';
import { places } from './scenes/04-places';
import { access } from './scenes/05-access';
import { incidents } from './scenes/06-incidents';
import { analytics } from './scenes/07-analytics';
import { privacy } from './scenes/08-privacy';
import { open, openSession } from './session';

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
  const out = spawnSync(FFMPEG, ['-i', file, '-f', 'null', '-'], {
    encoding: 'utf8',
  }).stderr;
  const last = [...out.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].at(-1);
  if (!last) throw new Error(`cannot read the duration of ${file}`);
  return last.slice(1).reduce((sum, v, i) => sum + Number(v) * [3600, 60, 1][i], 0);
}

async function main(): Promise<void> {
  const wanted = process.argv.slice(2);
  const scenes = wanted.length ? wanted.map((id) => ALL.find((s) => s.id === id) ?? fail(id)) : ALL;
  mkdirSync(OUT, { recursive: true });
  const { browser, page } = await openSession();
  try {
    for (const scene of scenes) {
      await open(page, scene.start);
      const webm = join(OUT, `${scene.id}.webm`);
      const marks = new Marks(scene.id);
      const cast = await page.screencast.start({
        path: webm,
        size: { width: 1920, height: 1080 },
        quality: 100,
        fps: 30,
      });
      marks.start();
      await scene.record(page, marks);
      await cast[Symbol.asyncDispose]?.();
      await page.screencast.stop().catch(() => undefined);
      const mp4 = join(OUT, `${scene.id}.mp4`);
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
      process.stdout.write(`recorded ${scene.id}\n`);
    }
  } finally {
    await browser.close();
  }
}

function fail(id: string): never {
  throw new Error(`unknown scene ${id}; known: ${ALL.map((s) => s.id).join(', ')}`);
}

await main();
