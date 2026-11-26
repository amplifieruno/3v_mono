import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { bundle } from '@remotion/bundler';
import { selectComposition } from '@remotion/renderer';

/**
 * `tsx scripts/render.ts <out.mp4> [--scale=0.5] [--chunk=900] [--crf=18]`
 *
 * Renders the film in chunks of frames, each in its own CLI process, then the soundtrack once, and joins
 * them with ffmpeg. One long render on this box gets killed by the low-memory watchdog; chunks stay small.
 */
const args = process.argv.slice(2);
const flag = (name: string, fallback: number): number => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};
const out = resolve(args.find((a) => !a.startsWith('--')) ?? 'out/itap-demo.mp4');
const scale = flag('scale', 1);
const chunk = flag('chunk', 900);
const crf = flag('crf', 18);
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';

const root = resolve(import.meta.dirname, '..');
const work = join(root, 'out', '.chunks');
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

const bundleDir = join(work, 'bundle');
const serveUrl = await bundle({
  entryPoint: join(root, 'src/index.ts'),
  publicDir: join(root, 'public'),
  outDir: bundleDir,
});
const composition = await selectComposition({ serveUrl, id: 'ItapDemo' });
const total = composition.durationInFrames;
process.stdout.write(`${total} frames (${(total / composition.fps).toFixed(1)} s)\n`);

/** One CLI render per chunk: a fresh browser and compositor each time, retried if the watchdog kills it. */
function cli(extra: string[], label: string): void {
  const base = ['remotion', 'render', bundleDir, 'ItapDemo', ...extra];
  const opts = [
    '--concurrency=2',
    '--offthreadvideo-cache-size-in-bytes=400000000',
    `--scale=${scale}`,
  ];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = spawnSync('npx', [...base, ...opts, '--log=error'], { cwd: root, stdio: 'inherit' });
    if (r.status === 0) return void process.stdout.write(`${label} done\n`);
    process.stdout.write(`${label} failed (attempt ${attempt})\n`);
  }
  throw new Error(`${label}: render failed three times`);
}

const parts: string[] = [];
for (let from = 0; from < total; from += chunk) {
  const to = Math.min(total, from + chunk) - 1;
  const file = join(work, `part-${String(parts.length).padStart(3, '0')}.mp4`);
  cli(
    [
      file,
      `--frames=${from}-${to}`,
      '--codec=h264',
      `--crf=${crf}`,
      '--pixel-format=yuv420p',
      '--muted',
    ],
    `frames ${from}-${to}`,
  );
  parts.push(file);
}

const audio = join(work, 'audio.wav');
cli([audio, '--codec=wav'], 'soundtrack');

const list = join(work, 'parts.txt');
writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n'));
execFileSync(FFMPEG, [
  '-v',
  'error',
  '-y',
  '-f',
  'concat',
  '-safe',
  '0',
  '-i',
  list,
  '-i',
  audio,
  '-map',
  '0:v',
  '-map',
  '1:a',
  '-c:v',
  'copy',
  '-c:a',
  'aac',
  '-b:a',
  '192k',
  '-movflags',
  '+faststart',
  '-shortest',
  out,
]);
rmSync(work, { recursive: true, force: true });
process.stdout.write(`${out}\n`);
