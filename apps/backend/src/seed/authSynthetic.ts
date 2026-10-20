import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { DEFAULT_MODEL_VERSION, detectedAttributes, type EnrollmentDeps } from '../face/enrollmentService.js';
import { analyzePhotos, commitPhotos } from '../face/enrollmentSteps.js';
import { photoFromBuffer } from '../face/photoSources.js';
import { SYNTHETIC_PAIRS } from './authAppsPlan.js';
import { FACES_DIR } from './faceManifest.js';
import { SEGMENT_NAMES } from './segmentPlan.js';
import type { SeedContext } from './tenancy.js';

/**
 * Synthetic identities of the Developer Sandbox (slice 9): ~20 faces of people who do not exist — 50/50 pixel blends
 * of two seed face crops (and the mirrored blend as a second photo) — enrolled through the real enrollment steps
 * (InsightFace detection + quality + embedding, crops in the organization bucket, photos and embeddings in one
 * transaction) as unlinked identities with is_synthetic = true (never matched by cameras, search or production apps).
 * They are the members of the manual identity segment "Sandbox test identities" the sandbox app is bound to.
 * Idempotent by attributes.seed_ref (`sandbox/NN`).
 */
const SIZE = 224;

async function rawFace(folder: string, mirror: boolean): Promise<Buffer> {
  const image = sharp(await readFile(join(FACES_DIR, folder, '1.jpg'))).resize(SIZE, SIZE).removeAlpha();
  return (mirror ? image.flop() : image).raw().toBuffer();
}

/** The two photos of one synthetic person: the blend of both crops and its mirror image (JPEG). */
export async function blendedFaces(a: string, b: string): Promise<Buffer[]> {
  return Promise.all(
    [false, true].map(async (mirror) => {
      const [x, y] = [await rawFace(a, mirror), await rawFace(b, mirror)];
      const out = Buffer.alloc(x.length);
      for (let i = 0; i < x.length; i += 1) out[i] = Math.round((x[i] + y[i]) / 2);
      return sharp(out, { raw: { width: SIZE, height: SIZE, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
    }),
  );
}

const EXISTING = `
  query SeedSynthetic($org: uuid!, $segment: String!) {
    identities(where: { organization_id: { _eq: $org }, is_synthetic: { _eq: true } }) { id attributes }
    segments(where: { organization_id: { _eq: $org }, name: { _eq: $segment } }) { id }
  }
`;
const INSERT_SEGMENT = `
  mutation SeedSandboxSegment($segment: segments_insert_input!, $members: [segment_members_insert_input!]!) {
    insert_segments_one(object: $segment) { id }
    insert_segment_members(objects: $members) { affected_rows }
  }
`;

export type SeedSyntheticResult = { identities: string[]; created: number; segmentId: string };

export async function seedSyntheticIdentities(
  ctx: SeedContext,
  deps: EnrollmentDeps,
  args: { org: string; admin: string; configuredAt: number },
): Promise<SeedSyntheticResult> {
  const data = await ctx.admin.request<{ identities: { id: string; attributes: { seed_ref?: unknown } | null }[]; segments: { id: string }[] }>(
    EXISTING,
    { org: args.org, segment: SEGMENT_NAMES.sandbox },
  );
  const byRef = new Map(data.identities.map((i) => [String(i.attributes?.seed_ref ?? ''), i.id]));
  const identities: string[] = [];
  let created = 0;
  for (const [n, [a, b]] of SYNTHETIC_PAIRS.entries()) {
    const ref = `sandbox/${String(n + 1).padStart(2, '0')}`;
    const existing = byRef.get(ref);
    if (existing) {
      identities.push(existing);
      continue;
    }
    const images = await blendedFaces(a, b);
    const photos = images.map((image, i) => photoFromBuffer(`${ref}/${i === 0 ? 'blend' : 'blend-mirror'}.jpg`, image));
    const { accepted, rejected } = await analyzePhotos(photos, deps.insightFace, deps.clients.actor);
    if (accepted.length === 0) throw new Error(`seed: synthetic face ${ref} rejected (${rejected.map((r) => r.reason).join(', ')})`);
    const id = randomUUID();
    await commitPhotos(
      { actor: deps.clients.actor, storage: deps.storage, organizationId: args.org, modelVersion: deps.modelVersion ?? DEFAULT_MODEL_VERSION },
      {
        identityId: id,
        newIdentity: {
          organization_id: args.org,
          source: 'manual',
          is_synthetic: true,
          created_at: new Date(args.configuredAt).toISOString(),
          attributes: { ...detectedAttributes(accepted), seed_ref: ref, label: `Sandbox person ${n + 1}`, synthetic: { method: 'blend', of: [a, b] } },
        },
      },
      'manual',
      accepted,
    );
    identities.push(id);
    created += 1;
  }

  let segmentId = data.segments[0]?.id;
  if (!segmentId) {
    segmentId = randomUUID();
    const at = new Date(args.configuredAt).toISOString();
    await ctx.admin.request(INSERT_SEGMENT, {
      segment: {
        id: segmentId, organization_id: args.org, name: SEGMENT_NAMES.sandbox, kind: 'manual', target: 'identities', conditions: {},
        description: 'Synthetic identities of the Developer Sandbox (generated faces, no real people)', color: '#a16207', icon: 'flask-conical',
        created_at: at,
      },
      members: identities.map((identity_id) => ({
        organization_id: args.org, segment_id: segmentId, target: 'identities', identity_id, source: 'manual',
        added_by: args.admin, added_at: at, created_at: at,
      })),
    });
  }
  return { identities, created, segmentId };
}
