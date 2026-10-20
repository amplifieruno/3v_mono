import { randomUUID } from 'node:crypto';
import { createHasuraClient } from '../hasura/client.js';
import { AUTH_APPS, effectiveThreshold, type AuthAppKey } from './authAppsPlan.js';
import { attackPayload, hexDigest, qualityPayload } from './authPayloads.js';
import { planAuthHistory, type AuthFlowPlan } from './authPlan.js';
import { uploadEvidence, type Person, type Pools } from './authPools.js';
import { formatVector, probeNear } from './authProbes.js';
import { signHistoryWebhooks } from './historyNotifications.js';
import { localDate } from './historyTime.js';
import { seededRandom, type Random } from './random.js';
import type { SeedContext } from './tenancy.js';

/**
 * The 30-day authentication history (slice 9): the plan (authPlan.ts) replayed in time order through
 * itap.seed_auth_flow — real auth_open_session / auth_decide / auth_second_factor / review_authentication_attempt at
 * the simulated instants — one GraphQL request (one transaction) per local day, ending with
 * seed_finalize_notifications so the deliveries Stage C wrote are dated like the replayed detection history. Probes
 * are template-derived (authProbes.ts): no InsightFace call. Reviews are decided by the organization's second admin.
 */
export type SeedAuthHistoryResult = { sessions: number; attempts: number; reviews: number; evidence: number; outcomes: Record<string, number>; webhooksSigned: number };

type Attempt = { outcome: string; failure_reason: string | null; attack_outcome: string; review_status: string };
type Item = { at: number; flow: Record<string, unknown> };

function personAt(list: Person[], n: number): Person {
  return list[n % list.length];
}

/** The subject, the probe person and the claimed identity of a session. */
function cast(f: AuthFlowPlan, pools: Pools): { prober: (probe: string | null) => Person; claimed: Person | null } {
  const { members, outsiders } = pools[f.app];
  const subject = personAt(members, f.subject);
  const outsider = personAt(outsiders, f.subject);
  const other = members.length > 1 ? members[(members.indexOf(subject) + 1 + (f.other % (members.length - 1))) % members.length] : outsider;
  const claimed = f.mode !== 'verification' ? null : f.scenario === 'not_in_population' ? outsider : subject;
  return { claimed, prober: (probe) => (probe === 'outsider' ? outsider : probe === 'impostor' ? other : subject) };
}

function similarity(probe: string, threshold: number, rng: Random): number {
  if (probe === 'match') return Math.min(0.97, threshold + 0.06 + rng.next() * 0.24);
  if (probe === 'partial') return threshold - 0.015 - rng.next() * 0.05;
  return 0.8 + rng.next() * 0.15;
}

async function buildFlow(
  ctx: SeedContext,
  f: AuthFlowPlan,
  env: { org: string; pools: Pools; apps: Record<AuthAppKey, string>; keys: Partial<Record<AuthAppKey, string>>; accessPoints: Map<string, string>; digests: Map<number, string> },
): Promise<{ flow: Record<string, unknown>; evidence: number }> {
  const rng = seededRandom(`nova-tower/face-auth/flow/${f.index}`);
  const sessionId = randomUUID();
  const { claimed, prober } = cast(f, env.pools);
  const threshold = effectiveThreshold(AUTH_APPS[f.app], f.mode);
  let evidence = 0;
  const steps: Record<string, unknown>[] = [];
  for (const s of f.steps) {
    const at = new Date(f.at + s.offsetMs).toISOString();
    if (s.kind === 'second_factor') {
      steps.push({ kind: 'second_factor', at, passed: s.passed, method: s.method });
      continue;
    }
    const person = prober(s.probe);
    const replayed = s.attack === 'replay' && f.replayOf !== null ? env.digests.get(f.replayOf) : undefined;
    const digest = replayed ?? hexDigest(rng);
    env.digests.set(f.index, digest);
    let evidenceFile: string | null = null;
    if (s.evidence) {
      evidenceFile = await uploadEvidence(ctx, { org: env.org, sessionId, photo: person.photo, quality: s.quality });
      evidence += 1;
    }
    steps.push({
      kind: 'decide',
      at,
      embedding: s.probe === null ? null : formatVector(probeNear(person.templates, similarity(s.probe, threshold, rng), rng)),
      quality: qualityPayload(rng, s.quality),
      attack: attackPayload(rng, s.attack, digest),
      evidence_file_id: evidenceFile,
    });
  }
  return {
    evidence,
    flow: {
      kind: 'session', application_id: env.apps[f.app], session_id: sessionId, key_id: env.keys[f.app] ?? null, mode: f.mode,
      claimed_identity_id: claimed?.id ?? null, access_point_id: f.accessPoint ? env.accessPoints.get(f.accessPoint) ?? null : null,
      device_ref: f.device, ip: f.ip, user_agent: f.userAgent, at: new Date(f.at).toISOString(), steps,
      ...(f.review ? { review: { kind: 'review', session_id: sessionId, at: new Date(f.review.at).toISOString(), approve: f.review.approve, note: f.review.note } } : {}),
    },
  };
}

export async function seedAuthHistory(
  ctx: SeedContext,
  args: { org: string; reviewer: string; timezone: string; pools: Pools; apps: Record<AuthAppKey, string>; keys: Partial<Record<AuthAppKey, string>>; accessPoints: Map<string, string> },
): Promise<SeedAuthHistoryResult> {
  const plan = planAuthHistory({ now: ctx.now.getTime(), timezone: args.timezone });
  const client = createHasuraClient(ctx.env, { role: 'admin', userId: args.reviewer, organizationId: args.org });
  const env = { ...args, digests: new Map<number, string>() };
  const byDay = new Map<string, Item[]>();
  let evidence = 0;
  for (const f of plan) {
    const built = await buildFlow(ctx, f, env);
    evidence += built.evidence;
    const { review, ...flow } = built.flow;
    const day = localDate(f.at, args.timezone);
    const items = byDay.get(day) ?? [];
    items.push({ at: f.at, flow });
    if (f.review && review) items.push({ at: f.review.at, flow: review as Record<string, unknown> });
    byDay.set(day, items);
  }

  const outcomes: Record<string, number> = {};
  let attempts = 0;
  let reviews = 0;
  for (const items of byDay.values()) {
    items.sort((a, b) => a.at - b.at);
    const defs = items.map((_, i) => `$f${i}: jsonb!`);
    const fields = items.map((_, i) => `f${i}: seed_auth_flow(args: { p_flow: $f${i} }) { outcome failure_reason attack_outcome review_status }`);
    const until = new Date(Math.min(items[items.length - 1].at + 3_600_000, ctx.now.getTime())).toISOString();
    const variables: Record<string, unknown> = { org: args.org, until };
    items.forEach((item, i) => (variables[`f${i}`] = item.flow));
    const data = await client.request<Record<string, Attempt[]>>(
      `mutation SeedAuthDay($org: uuid!, $until: timestamptz!, ${defs.join(', ')}) {
        ${fields.join('\n')}
        fin: seed_finalize_notifications(args: { p_organization: $org, p_until: $until }) { id }
      }`,
      variables,
    );
    items.forEach((item, i) => {
      const rows = data[`f${i}`] ?? [];
      if (item.flow.kind === 'review') {
        reviews += 1;
        return;
      }
      attempts += rows.length;
      for (const r of rows) {
        const key = r.outcome === 'failure' ? `failure/${r.failure_reason}` : r.outcome;
        outcomes[key] = (outcomes[key] ?? 0) + 1;
      }
    });
  }
  const webhooksSigned = await signHistoryWebhooks(ctx, args.org);
  return { sessions: plan.length, attempts, reviews, evidence, outcomes, webhooksSigned };
}
