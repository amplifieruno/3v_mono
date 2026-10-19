import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { z } from 'zod';
import { photoFromBuffer, type PhotoSource } from '../face/photoSources.js';

/** Built by `src/seed/tools/extract-faces.ts`; see the manifest for sources and licences. */
export const FACES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../seed-assets/faces');

const personSchema = z.object({
  folder: z.string().regex(/^person-\d{2}$/),
  role: z.enum(['employee', 'vip', 'blacklisted', 'unknown']),
  source: z.string(),
  licence: z.string(),
  files: z.array(z.object({ file: z.string(), origin: z.string(), detectorScore: z.number() })).min(1),
});

export type FacePerson = z.output<typeof personSchema>;

export async function loadFaceManifest(): Promise<FacePerson[]> {
  const raw: unknown = JSON.parse(await readFile(join(FACES_DIR, 'manifest.json'), 'utf8'));
  return z.object({ people: z.array(personSchema) }).parse(raw).people;
}

/** Photo sources for some of a person's crops (ref = `<folder>/<file>`). */
export async function facePhotos(person: FacePerson, files = person.files): Promise<PhotoSource[]> {
  return Promise.all(
    files.map(async ({ file }) => photoFromBuffer(`${person.folder}/${file}`, await readFile(join(FACES_DIR, person.folder, file)))),
  );
}

/** The person's first crop mirrored: a second capture of a person with a single photo (ref `<folder>/<file>#mirror`). */
export async function mirroredPhoto(person: FacePerson): Promise<PhotoSource> {
  const { file } = person.files[0];
  const image = await sharp(await readFile(join(FACES_DIR, person.folder, file))).flop().jpeg({ quality: 90 }).toBuffer();
  return photoFromBuffer(`${person.folder}/${file}#mirror`, image);
}
