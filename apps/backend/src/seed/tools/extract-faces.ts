/**
 * Builds `seed-assets/faces/` from the stream-server sample videos (Pexels licence): samples frames with ffmpeg,
 * runs InsightFace on them, clusters the faces by embedding, keeps people seen at least twice with good quality and
 * saves 2–4 face crops per person plus `manifest.json` (folder → role, source, licence). More employees (one photo
 * each) are cut from the crowd photo `libs/InsightFace-REST/misc/test_images/lumia.jpg` (an InsightFace-REST test
 * asset whose photo rights are uncertain; see `seed-assets/faces/NOTICE`).
 *
 * Reproducible: same videos + same InsightFace models → same output. Requires `ffmpeg` on PATH (or FFMPEG=<path>)
 * and a reachable InsightFace-REST (INSIGHTFACE_API_URL). Usage:
 *   pnpm --filter backend exec tsx src/seed/tools/extract-faces.ts
 */
import 'dotenv/config';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { createInsightFaceClient, type ExtractedFace, type InsightFaceClient } from '../../face/insightFaceClient.js';
import { qualityScore } from '../../face/quality.js';
import {
  assignRoles,
  clusterFaces,
  cosineDistance,
  distinctClusters,
  joinClusters,
  pickRepresentatives,
  type Cluster,
  type FrameFace,
} from './faceClusters.js';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, '../../../../..');
const VIDEOS = join(REPO, 'docker/stream-server/videos');
const OUTPUT = resolve(here, '../../../seed-assets/faces');

const SAMPLE_FPS = 3;
/** Faces kept for clustering: detector score and shorter side of the box in frame pixels. */
const MIN_SCORE = 0.7;
const MIN_SIDE = 40;
const MIN_FACES_PER_PERSON = 2;
const MAX_CROPS = 4;
const CROP_SIDE = 224;
/** Context around the face box in the saved crop, as a share of the box size on each side. */
const CROP_MARGIN = 0.6;
const MAX_CROP_BYTES = 40 * 1024;
/** Default organization recognition threshold: people closer than this would be matched as one. */
const RECOGNITION_THRESHOLD = 0.5;
/** Greedy clusters closer than this are one person seen from another angle. */
const SAME_PERSON_JOIN = 0.3;
const PEXELS = 'Pexels License (https://www.pexels.com/license/): free to use, no attribution required';
/** Crowd photo from the InsightFace-REST submodule (photo rights uncertain, see NOTICE): one crop per visible face. */
const CROWD = join(REPO, 'libs/InsightFace-REST/misc/test_images/lumia.jpg');
const CROWD_SOURCE = 'libs/InsightFace-REST/misc/test_images/lumia.jpg';
const CROWD_LICENCE =
  'Rights uncertain: InsightFace-REST test image (its Apache-2.0 licence covers the code, not the photograph); demo use only, see NOTICE';
const CROWD_MIN_SIDE = 48;

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

async function sampleFrames(video: string, dir: string): Promise<string[]> {
  const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
  await run(ffmpeg, ['-loglevel', 'error', '-i', video, '-vf', `fps=${SAMPLE_FPS}`, '-q:v', '2', join(dir, 'f_%04d.jpg')]);
  return (await readdir(dir)).filter((f) => f.endsWith('.jpg')).sort().map((f) => join(dir, f));
}

/**
 * InsightFace downsizes images to 640 px, which loses small faces in 1280x720 frames: detect on square tiles
 * (side = frame height) and map boxes back; a face seen in two overlapping tiles is kept once (nearest centers).
 */
async function detectInFrame(client: InsightFaceClient, frame: Buffer): Promise<{ face: ExtractedFace; quality: number }[]> {
  const { width = 0, height = 0 } = await sharp(frame).metadata();
  const side = Math.min(width, height);
  const steps = Math.max(1, Math.ceil((width - side) / (side * 0.6)));
  const found: { face: ExtractedFace; quality: number }[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const left = Math.round(((width - side) * i) / steps);
    const tile = await sharp(frame).extract({ left, top: 0, width: side, height: side }).jpeg({ quality: 95 }).toBuffer();
    for (const face of await client.extract(tile)) {
      const [x1, y1, x2, y2] = face.bbox;
      const mapped: ExtractedFace = { ...face, bbox: [x1 + left, y1, x2 + left, y2] };
      const quality = qualityScore(face, side, side);
      const cx = (x1 + x2) / 2 + left;
      const twin = found.findIndex((f) => Math.abs((f.face.bbox[0] + f.face.bbox[2]) / 2 - cx) < (x2 - x1) / 2);
      if (twin === -1) found.push({ face: mapped, quality });
      else if (quality > found[twin].quality) found[twin] = { face: mapped, quality };
    }
  }
  return found;
}

/** Square crop around the face with context, resized to CROP_SIDE, compressed until it fits MAX_CROP_BYTES. */
async function cropPerson(frame: Buffer, bbox: ExtractedFace['bbox'], margin = CROP_MARGIN): Promise<Buffer> {
  const { width = 0, height = 0 } = await sharp(frame).metadata();
  const [x1, y1, x2, y2] = bbox;
  const size = Math.max(x2 - x1, y2 - y1) * (1 + 2 * margin);
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const left = Math.max(0, Math.round(cx - size / 2));
  const top = Math.max(0, Math.round(cy - size / 2));
  const region = {
    left,
    top,
    width: Math.min(width - left, Math.round(size)),
    height: Math.min(height - top, Math.round(size)),
  };
  for (const quality of [85, 75, 65, 55]) {
    const jpeg = await sharp(frame).extract(region).resize(CROP_SIDE, CROP_SIDE, { fit: 'cover' }).jpeg({ quality }).toBuffer();
    if (jpeg.length <= MAX_CROP_BYTES) return jpeg;
  }
  throw new Error('Crop does not fit the size budget');
}

type ManifestPerson = {
  folder: string;
  role: string;
  source: string;
  licence: string;
  /** `origin`: video and second, or the face box in the source photo. */
  files: { file: string; origin: string; detectorScore: number }[];
};

/** Employees with one photo each, cut from the crowd photo (faces not already among the video people). */
async function crowdPeople(client: InsightFaceClient, known: number[][], offset: number): Promise<ManifestPerson[]> {
  const image = await readFile(CROWD);
  const people: ManifestPerson[] = [];
  const faces = (await client.extract(image))
    .filter((f) => f.score >= MIN_SCORE && Math.min(f.bbox[2] - f.bbox[0], f.bbox[3] - f.bbox[1]) >= CROWD_MIN_SIDE)
    .sort((a, b) => a.bbox[0] - b.bbox[0]);
  for (const face of faces) {
    const crop = await cropPerson(image, face.bbox, 0.35);
    const check = await client.extract(crop);
    if (check.length !== 1 || qualityScore(check[0], CROP_SIDE, CROP_SIDE) < 0.5) continue;
    if (known.some((c) => cosineDistance(c, check[0].embedding) < RECOGNITION_THRESHOLD)) continue;
    known.push(check[0].embedding);
    const folder = `person-${String(offset + people.length + 1).padStart(2, '0')}`;
    await mkdir(join(OUTPUT, folder), { recursive: true });
    await writeFile(join(OUTPUT, folder, '1.jpg'), crop);
    const detectorScore = Math.round(face.score * 100) / 100;
    people.push({ folder, role: '', source: CROWD_SOURCE, licence: CROWD_LICENCE, files: [{ file: '1.jpg', origin: `bbox ${face.bbox.map(Math.round).join(',')}`, detectorScore }] });
  }
  return people;
}

/**
 * Detects faces in every sampled frame (`frame` = path relative to `work`). With FACES_CACHE=<file> the detections
 * are saved there and reused on the next run (frames are re-sampled, which is deterministic).
 */
async function detectVideos(client: InsightFaceClient, videos: string[], work: string): Promise<FrameFace[]> {
  const cache = process.env.FACES_CACHE;
  const paths: { video: string; index: number; path: string }[] = [];
  for (const video of videos) {
    const dir = join(work, basename(video, '.mp4'));
    await mkdir(dir);
    (await sampleFrames(join(VIDEOS, video), dir)).forEach((path, index) => paths.push({ video, index, path }));
  }
  if (cache && existsSync(cache)) return JSON.parse(await readFile(cache, 'utf8')) as FrameFace[];
  const faces: FrameFace[] = [];
  for (const { video, index, path } of paths) {
    for (const { face, quality } of await detectInFrame(client, await readFile(path))) {
      const [x1, y1, x2, y2] = face.bbox;
      if (face.score < MIN_SCORE || Math.min(x2 - x1, y2 - y1) < MIN_SIDE) continue;
      faces.push({ video, time: index / SAMPLE_FPS, frame: relative(work, path), face, quality });
    }
    if (index === 0) log(`${video}: detecting...`);
  }
  log(`${faces.length} faces in ${paths.length} frames`);
  if (cache) await writeFile(cache, JSON.stringify(faces));
  return faces;
}

/** 2–4 verified crops of each video person (clusters with too few usable crops are dropped). */
async function videoPeople(client: InsightFaceClient, clusters: Cluster[], work: string): Promise<ManifestPerson[]> {
  const people: ManifestPerson[] = [];
  for (const cluster of clusters) {
    const folder = `person-${String(people.length + 1).padStart(2, '0')}`;
    const files: ManifestPerson['files'] = [];
    for (const member of pickRepresentatives(cluster, MAX_CROPS * 2)) {
      if (files.length >= MAX_CROPS) break;
      const crop = await cropPerson(await readFile(join(work, member.frame)), member.face.bbox);
      // The crop must still hold exactly one recognizable face of this person (it is enrolled as is).
      const check = await client.extract(crop);
      if (check.length !== 1 || cosineDistance(cluster.centroid, check[0].embedding) >= RECOGNITION_THRESHOLD) continue;
      if (qualityScore(check[0], CROP_SIDE, CROP_SIDE) < 0.5) continue;
      const file = `${files.length + 1}.jpg`;
      await mkdir(join(OUTPUT, folder), { recursive: true });
      await writeFile(join(OUTPUT, folder, file), crop);
      files.push({ file, origin: `${member.video} @ ${member.time.toFixed(2)}s`, detectorScore: Math.round(member.face.score * 100) / 100 });
    }
    if (files.length < MIN_FACES_PER_PERSON) {
      log(`dropped a person seen ${cluster.members.length}x: fewer than ${MIN_FACES_PER_PERSON} usable crops`);
      await rm(join(OUTPUT, folder), { recursive: true, force: true });
      continue;
    }
    const sources = [...new Set(files.map((f) => f.origin.split(' @ ')[0]))].join(', ');
    people.push({ folder, role: '', source: `docker/stream-server/videos/${sources}`, licence: PEXELS, files });
  }
  return people;
}

async function main(): Promise<void> {
  const client = createInsightFaceClient(process.env.INSIGHTFACE_API_URL ?? 'http://localhost:18080');
  const videos = (await readdir(VIDEOS)).filter((f) => f.endsWith('.mp4')).sort();
  if (videos.length === 0) throw new Error(`No videos in ${VIDEOS} (run docker/stream-server/download-samples.sh)`);
  const work = await mkdtemp(join(tmpdir(), 'itap-faces-'));
  try {
    const faces = await detectVideos(client, videos, work);
    const joined = joinClusters(clusterFaces(faces), SAME_PERSON_JOIN).filter((c) => c.members.length >= MIN_FACES_PER_PERSON);
    const { kept: clusters, dropped } = distinctClusters(joined, RECOGNITION_THRESHOLD);
    for (const c of dropped) log(`dropped a person seen ${c.members.length}x: too close to another person for the matcher`);
    await rm(OUTPUT, { recursive: true, force: true });
    const fromVideo = await videoPeople(client, clusters, work);
    const fromCrowd = await crowdPeople(client, clusters.map((c) => c.centroid), fromVideo.length);
    const roles = assignRoles(fromVideo.length, fromCrowd.length);
    fromVideo.forEach((p, i) => (p.role = roles.video[i]));
    fromCrowd.forEach((p, i) => (p.role = roles.crowd[i]));

    const manifest = {
      generatedBy: 'apps/backend/src/seed/tools/extract-faces.ts',
      note: 'Role "blacklisted" is applied by the watch-list seed (slice 4); until then the person is a normal profile.',
      people: [...fromVideo, ...fromCrowd],
    };
    await writeFile(join(OUTPUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    log(`Saved ${manifest.people.length} people to ${OUTPUT}`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`extract-faces failed: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
