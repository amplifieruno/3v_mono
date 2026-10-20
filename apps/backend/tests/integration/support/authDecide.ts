import { authWorld, createApp, insertSession, type ClientApp } from './authService.js';
import { EMBEDDING_DIM, axis, vectorLiteral } from './faces.js';
import { runSql, runSqlRows } from './sql.js';

/** Helpers for the face authentication decision engine (slice 9 task 2): itap.auth_decide / auth_population. */

export type Decision = {
  attempt_id: string | null;
  outcome: string;
  matched_identity_id: string | null;
  profile_id: string | null;
  confidence: number | null;
  threshold_used: number;
  failure_reason: string | null;
  attack_outcome: string;
  retrieval_candidates: number | null;
  retrieval_hit: boolean | null;
  comparison_score: number | null;
  population_size: number;
  attributes: Record<string, unknown>;
};

export type DecideOptions = {
  session?: string | null;
  mode?: 'identification' | 'verification';
  claimed?: string | null;
  accessPoint?: string | null;
  embedding?: number[] | null;
  quality?: Record<string, unknown>;
  attack?: Record<string, unknown>;
  requestThreshold?: number | null;
  at?: string | null;
  record?: boolean;
};

const lit = (v: string | null | undefined, type: string): string => (v ? `'${v}'::${type}` : `null::${type}`);
const json = (v: unknown): string => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
const nul = (v: string | null | undefined): string | null => (v === null || v === undefined || v === 'NULL' ? null : v);
const num = (v: string | null | undefined): number | null => (nul(v) === null ? null : Number(v));

export function decideSql(org: string, app: string, o: DecideOptions = {}): string {
  const emb = o.embedding === null ? 'null::vector' : `'${vectorLiteral(o.embedding ?? axis(0))}'::vector`;
  return `itap.auth_decide('${org}', '${app}', ${lit(o.session, 'uuid')}, '${o.mode ?? 'identification'}',
    ${lit(o.claimed, 'uuid')}, ${lit(o.accessPoint, 'uuid')}, ${emb},
    ${json({ model_version: 'test_model', ...(o.quality ?? {}) })}, ${json({ outcome: 'passed', ...(o.attack ?? {}) })},
    ${o.requestThreshold === undefined || o.requestThreshold === null ? 'null::numeric' : String(o.requestThreshold)},
    ${lit(o.at, 'timestamptz')}, ${o.record === false ? 'false' : 'true'})`;
}

/** Calls itap.auth_decide through run_sql (admin) and returns the composite as a typed row. */
export async function decide(org: string, app: string, o: DecideOptions = {}): Promise<Decision> {
  const [r] = await runSqlRows(`select d.* from ${decideSql(org, app, o)} d`);
  return {
    attempt_id: nul(r.attempt_id),
    outcome: r.outcome ?? '',
    matched_identity_id: nul(r.matched_identity_id),
    profile_id: nul(r.profile_id),
    confidence: num(r.confidence),
    threshold_used: Number(r.threshold_used),
    failure_reason: nul(r.failure_reason),
    attack_outcome: r.attack_outcome ?? '',
    retrieval_candidates: num(r.retrieval_candidates),
    retrieval_hit: nul(r.retrieval_hit) === null ? null : r.retrieval_hit === 't',
    comparison_score: num(r.comparison_score),
    population_size: Number(r.population_size),
    attributes: JSON.parse(r.attributes ?? '{}') as Record<string, unknown>,
  };
}

/** The decision with the attempt-specific id removed (for "identical response" comparisons). */
export const publicPart = (d: Decision): Omit<Decision, 'attempt_id'> =>
  Object.fromEntries(Object.entries(d).filter(([key]) => key !== 'attempt_id')) as Omit<Decision, 'attempt_id'>;

export async function population(org: string, app: string, accessPoint: string | null = null, at: string | null = null): Promise<string[]> {
  const rows = await runSqlRows(
    `select identity_id from itap.auth_population('${org}', '${app}', ${lit(accessPoint, 'uuid')}, ${lit(at, 'timestamptz')})
     order by identity_id`,
  );
  return rows.map((r) => String(r.identity_id));
}

export async function populationScope(org: string, app: string, accessPoint: string | null = null): Promise<Record<string, unknown>> {
  const [r] = await runSqlRows(
    `select itap.auth_population_scope('${org}', '${app}', ${lit(accessPoint, 'uuid')}, null) as s`,
  );
  return JSON.parse(r.s ?? '{}') as Record<string, unknown>;
}

/** A unit vector with cos = `similarity` to axis(from) (rotated towards axis(to)). */
export function similarTo(from: number, to: number, similarity: number): number[] {
  const sin = Math.sqrt(1 - similarity * similarity);
  return Array.from({ length: EMBEDDING_DIM }, (_, i) => (i === from ? similarity : i === to ? sin : 0));
}

/** Inserts an identity (SQL, admin) with one template per vector; returns its id. */
export async function faceIdentity(
  org: string,
  vectors: number[][],
  extra: { profile?: string; synthetic?: boolean; status?: string; matching?: boolean } = {},
): Promise<string> {
  const [row] = await runSqlRows(
    `insert into itap.identities (organization_id, profile_id, is_synthetic)
     values ('${org}', ${lit(extra.profile, 'uuid')}, ${extra.synthetic ? 'true' : 'false'})
     returning id`,
  );
  const id = String(row.id);
  for (const v of vectors) {
    await runSql(`insert into itap.identity_embeddings (organization_id, identity_id, embedding, quality_score)
      values ('${org}', '${id}', '${vectorLiteral(v)}', 0.9)`);
  }
  if (extra.matching === false) await runSql(`update itap.identities set matching_enabled = false where id = '${id}'`);
  if (extra.status) await runSql(`update itap.identities set status = '${extra.status}' where id = '${id}'`);
  return id;
}

export async function sqlProfile(org: string, extra: Record<string, string> = {}): Promise<string> {
  const cols = ['organization_id', 'first_name', 'last_name', ...Object.keys(extra)];
  const vals = [org, 'Auth', `Person ${Date.now().toString(36)}`, ...Object.values(extra)].map((v) => `'${v}'`);
  const [row] = await runSqlRows(`insert into itap.profiles (${cols.join(', ')}) values (${vals.join(', ')}) returning id`);
  return String(row.id);
}

/** Binds a segment (or several) / facility / access point / modes / attributes to an app (SQL, admin). */
export async function bind(
  org: string,
  app: string,
  b: { segments?: string[]; facilities?: string[]; accessPoints?: string[]; modes?: string[]; attributes?: string[] },
): Promise<void> {
  const rows = (table: string, col: string, ids: string[] = []): string[] =>
    ids.map((id) => `insert into itap.client_application_${table} (organization_id, application_id, ${col}) values ('${org}', '${app}', '${id}');`);
  const sql = [
    ...rows('segments', 'segment_id', b.segments),
    ...rows('facilities', 'facility_id', b.facilities),
    ...rows('access_points', 'access_point_id', b.accessPoints),
    ...rows('modes', 'mode', b.modes),
    ...rows('attributes', 'attribute', b.attributes),
  ];
  if (sql.length > 0) await runSql(sql.join('\n'));
}

/** Adds open members to a segment directly (SQL, admin; manual source). */
export async function addSegmentRows(org: string, segment: string, target: 'identities' | 'profiles', ids: string[], addedAt = 'now()'): Promise<void> {
  const col = target === 'identities' ? 'identity_id' : 'profile_id';
  if (ids.length === 0) return;
  await runSql(
    `insert into itap.segment_members (organization_id, segment_id, target, ${col}, source, added_at) values ` +
      ids.map((id) => `('${org}', '${segment}', '${target}', '${id}', 'manual', ${addedAt})`).join(', '),
  );
}

/** World: org A with an identification + verification app bound to a profile segment, one enrolled person on axis 0. */
export async function decideWorld(appExtra: Record<string, unknown> = {}) {
  const w = await authWorld();
  const org = w.orgA.id;
  const app: ClientApp = await createApp(w.a, { threshold: 0.6, threshold_min: 0.5, threshold_max: 0.9, ...appExtra });
  await bind(org, app.id, { segments: [w.segment.id], modes: ['identification', 'verification'] });
  const person = await faceIdentity(org, [axis(0)], { profile: w.profile });
  await addSegmentRows(org, w.segment.id, 'profiles', [w.profile]);
  const session = (extra: Record<string, unknown> = {}): Promise<string> => insertSession(org, app.id, extra);
  return { ...w, org, app, person, session };
}
export type DecideWorld = Awaited<ReturnType<typeof decideWorld>>;

export async function countRows(table: string, where: string): Promise<number> {
  const [r] = await runSqlRows(`select count(*) as n from itap.${table} where ${where}`);
  return Number(r.n);
}
