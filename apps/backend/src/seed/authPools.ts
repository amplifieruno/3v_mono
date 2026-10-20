import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { HistoryApp } from './authPlan.js';
import { parseVector } from './authProbes.js';
import type { QualityReason } from './authScenarios.js';
import type { SeedContext } from './tenancy.js';

/**
 * People of the seeded authentication history: who is inside each app's population (members) and who is not
 * (outsiders), with their stored templates (probes are derived from them) and primary photo (evidence frames).
 * Membership mirrors the bindings: Lobby Kiosk / HR Portal = employees, Visitor Check-in = visitors, Developer
 * Sandbox = synthetic identities; outsiders are faces of the organization outside that population.
 */
export type Person = { id: string; templates: number[][]; photo: string | null };
export type Pools = Record<HistoryApp, { members: Person[]; outsiders: Person[] }>;

const PEOPLE = `
  query SeedAuthPeople($org: uuid!) {
    identities(where: { organization_id: { _eq: $org }, status: { _nin: [merged, archived] }, matching_enabled: { _eq: true } }, order_by: { code: asc }) {
      id is_synthetic primary_photo_file_id profile { profile_type status }
      identity_embeddings(where: { is_template: { _eq: true } }, order_by: { quality_score: desc }) { embedding }
    }
  }
`;

type Row = {
  id: string;
  is_synthetic: boolean;
  primary_photo_file_id: string | null;
  profile: { profile_type: string; status: string } | null;
  identity_embeddings: { embedding: string }[];
};

export async function loadPools(ctx: SeedContext, org: string): Promise<Pools> {
  const { identities } = await ctx.admin.request<{ identities: Row[] }>(PEOPLE, { org });
  const faces = identities.filter((r) => r.identity_embeddings.length > 0);
  const person = (r: Row): Person => ({ id: r.id, templates: r.identity_embeddings.map((e) => parseVector(e.embedding)), photo: r.primary_photo_file_id });
  const production = faces.filter((r) => !r.is_synthetic);
  const isType = (r: Row, type: string) => r.profile?.profile_type === type && r.profile.status === 'active';
  const employees = production.filter((r) => isType(r, 'employee')).map(person);
  const nonEmployees = production.filter((r) => !isType(r, 'employee')).map(person);
  const visitors = production.filter((r) => isType(r, 'visitor')).map(person);
  const synthetic = faces.filter((r) => r.is_synthetic).map(person);
  const pools: Pools = {
    lobby: { members: employees, outsiders: nonEmployees },
    hr: { members: employees, outsiders: nonEmployees },
    visitor: { members: visitors, outsiders: employees },
    sandbox: { members: synthetic, outsiders: employees },
  };
  for (const [app, pool] of Object.entries(pools)) {
    if (pool.members.length === 0 || pool.outsiders.length === 0) throw new Error(`seed: face authentication pool of ${app} too small`);
  }
  return pools;
}

/** Evidence category -> how the kept frame looks (the subject's photo, blurred / dark / without a face). */
async function evidenceImage(ctx: SeedContext, photo: string | null, quality: QualityReason | null): Promise<Buffer> {
  if (quality === 'no_face' || !photo) {
    return sharp({ create: { width: 320, height: 240, channels: 3, background: { r: 46, g: 49, b: 54 } } }).jpeg({ quality: 80 }).toBuffer();
  }
  const image = sharp(await ctx.storage.download(photo)).resize(224, 224, { fit: 'cover' });
  if (quality === 'blur') return image.blur(6).jpeg({ quality: 85 }).toBuffer();
  if (quality === 'poor_lighting') return image.modulate({ brightness: 0.18 }).jpeg({ quality: 85 }).toBuffer();
  return image.jpeg({ quality: 85 }).toBuffer();
}

/** Uploads one evidence frame (kind auth_capture, the service's sensitive kind) for a seeded capture. */
export async function uploadEvidence(
  ctx: SeedContext,
  args: { org: string; sessionId: string; photo: string | null; quality: QualityReason | null },
): Promise<string> {
  const { id } = await ctx.storage.upload({
    bucketId: args.org,
    name: `auth-evidence-${randomUUID()}.jpg`,
    mimeType: 'image/jpeg',
    data: await evidenceImage(ctx, args.photo, args.quality),
    metadata: { kind: 'auth_capture', session_id: args.sessionId, frame_index: 0, seed: 'auth-history' },
  });
  return id;
}
