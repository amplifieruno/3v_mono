import { randomUUID } from 'node:crypto';
import { createHasuraClient } from '../hasura/client.js';
import type { OrgKey, SeedCompaniesResult } from './companies.js';
import { SCHEDULES } from './companies.js';
import type { SeedFacilitiesResult } from './facilities.js';
import { SEED_FACILITIES } from './facilityPlan.js';
import { configurationTime } from './historyTime.js';
import type { SeedPeopleResult } from './people.js';
import { seedSegmentRules } from './segmentRules.js';
import { matchSegmentHistory } from './segmentHistory.js';
import { buildSegmentHistoryMutation, type ManualInsert, type SegmentInsert } from './segmentMutation.js';
import {
  executiveMembers,
  frequentVisitorPin,
  novaSegments,
  riversideSegments,
  SEGMENT_NAMES,
  SEGMENT_TEMPLATES,
  segmentHistoryTimes,
  type SegmentSpec,
} from './segmentPlan.js';
import type { SeedContext, SeedTenancyResult } from './tenancy.js';

/**
 * Segments (design §6.5, §9; slice 6), after the history replay: system templates in both organizations; the Nova
 * Tower segments with their history, matched by the real evaluator once a minute after creation (configuration time,
 * before the replay), at every local day end since and at now (segmentHistory), written in one transaction together
 * with the segment rows, the back-dated manual memberships and the daily stats (segmentMutation); the Riverside
 * segment evaluated once at now; then the segment-scoped event rule and the segment-conditioned notification rule
 * (segmentRules), effective live only (see there).
 * Idempotent: templates and segments are keyed by name; only missing segments are created, with their history.
 */
export type SeedSegmentsResult = {
  templatesCreated: number;
  segmentsCreated: number;
  evaluations: number;
  syncs: number;
  rulesCreated: number;
  durationMs: number;
};

const EXISTING = `
  query SeedSegmentsExisting($org: uuid!) {
    segment_templates(where: { organization_id: { _eq: $org } }) { id name }
    segments(where: { organization_id: { _eq: $org } }) { id name }
  }
`;
const INSERT_TEMPLATES = `
  mutation SeedSegmentTemplates($objects: [segment_templates_insert_input!]!) {
    insert_segment_templates(objects: $objects) { affected_rows }
  }
`;
const PEOPLE = `
  query SeedSegmentPeople($org: uuid!) {
    chief: profiles(where: { organization_id: { _eq: $org }, department: { _eq: "Security" }, access_level: { _eq: elevated } },
                    order_by: { external_id: asc }, limit: 1) { id }
    assistants: profiles(
      where: { organization_id: { _eq: $org }, profile_type: { _eq: employee }, access_level: { _eq: standard },
               company: { name: { _in: ["Bluefin Capital", "Helix Biotech"] } } }
      order_by: { external_id: asc }
    ) { id company { name } }
  }
`;

type Named = { id: string; name: string };

async function existing(ctx: SeedContext, org: string): Promise<{ templates: Map<string, string>; segments: Map<string, string> }> {
  const data = await ctx.admin.request<{ segment_templates: Named[]; segments: Named[] }>(EXISTING, { org });
  return {
    templates: new Map(data.segment_templates.map((t) => [t.name, t.id])),
    segments: new Map(data.segments.map((s) => [s.name, s.id])),
  };
}

async function seedTemplates(ctx: SeedContext, org: string, createdAt: number): Promise<number> {
  const have = (await existing(ctx, org)).templates;
  const objects = SEGMENT_TEMPLATES.filter((t) => !have.has(t.name)).map((t) => ({
    organization_id: org,
    name: t.name,
    description: t.description,
    target: t.target,
    category: t.category,
    conditions: t.conditions,
    is_system: true,
    created_at: new Date(createdAt).toISOString(),
  }));
  if (objects.length === 0) return 0;
  const data = await ctx.admin.request<{ insert_segment_templates: { affected_rows: number } }>(INSERT_TEMPLATES, { objects });
  return data.insert_segment_templates.affected_rows;
}

type People = { manual: (segments: Map<string, string>) => ManualInsert[] };

/** The manual rows of the new Executive floor access / Frequent visitors segments. */
async function novaPeople(
  ctx: SeedContext,
  args: { org: string; adminUser: string; people: SeedPeopleResult; createdAt: number; now: number; timezone: string },
): Promise<People> {
  const data = await ctx.admin.request<{
    chief: { id: string }[];
    assistants: { id: string; company: { name: string } | null }[];
  }>(PEOPLE, { org: args.org });
  const firstOf = (company: string) => data.assistants.find((a) => a.company?.name === company)?.id;
  const assistants = [firstOf('Bluefin Capital'), firstOf('Helix Biotech')].filter((id): id is string => id !== undefined);
  const executive = executiveMembers({
    vips: args.people.byRole.vip,
    securityChief: data.chief[0]?.id ?? null,
    assistants,
    createdAt: args.createdAt,
    now: args.now,
    timezone: args.timezone,
  });
  const visitor = args.people.byRole.visitor[0];
  return {
    manual: (created) => {
      const exec = created.get(SEGMENT_NAMES.executive);
      const frequent = created.get(SEGMENT_NAMES.frequent);
      return [
        ...(exec ? executive.map((member) => ({ segmentId: exec, member })) : []),
        ...(frequent && visitor ? [{ segmentId: frequent, member: frequentVisitorPin(visitor, args) }] : []),
      ];
    },
  };
}

/** Creates the missing segments of one organization with their history; returns [created, evaluation times, syncs]. */
async function seedOrganizationSegments(
  ctx: SeedContext,
  args: { org: string; adminUser: string; specs: SegmentSpec[]; createdAt: number; timezone: string; people: People | null },
): Promise<[number, number, number]> {
  const { templates, segments } = await existing(ctx, args.org);
  const missing: SegmentInsert[] = args.specs
    .filter((s) => !segments.has(s.name))
    .map((spec) => {
      const templateId = spec.template ? templates.get(spec.template) : null;
      if (templateId === undefined) throw new Error(`seed: segment template ${spec.template} missing`);
      return { id: randomUUID(), spec, templateId };
    });
  if (missing.length === 0) return [0, 0, 0];

  const now = Date.now();
  const times = segmentHistoryTimes({ createdAt: Math.min(args.createdAt, now), now, timezone: args.timezone });
  const reader = createHasuraClient(ctx.env, { role: 'org_admin', organizationId: args.org });
  const syncs = await matchSegmentHistory(ctx, { org: args.org, reader, segments: missing, times: times.evaluations });
  const created = new Map(missing.map((s) => [s.spec.name, s.id]));
  const mutation = buildSegmentHistoryMutation({
    organization: args.org,
    createdAt: Math.min(args.createdAt, now),
    addedBy: args.adminUser,
    segments: missing,
    manual: args.people?.manual(created) ?? [],
    syncs,
    statsTimes: times.stats,
  });
  const actor = createHasuraClient(ctx.env, { role: 'admin', userId: args.adminUser, organizationId: args.org });
  const result = await actor.request<Record<string, unknown>>(mutation.query, mutation.variables);
  const stale = mutation.syncFields.filter((f) => (result[f] as { stale: boolean }[] | undefined)?.some((r) => r.stale));
  if (stale.length > 0) throw new Error(`seed: ${stale.length} segment history syncs were stale`);
  return [missing.length, times.evaluations.length, syncs.length];
}

export async function seedSegments(
  ctx: SeedContext,
  tenancy: SeedTenancyResult,
  companies: SeedCompaniesResult,
  people: SeedPeopleResult,
  facilities: SeedFacilitiesResult,
): Promise<SeedSegmentsResult> {
  const started = Date.now();
  const timezone = SEED_FACILITIES.nova.timezone;
  const configuredAt = configurationTime(ctx.now, timezone);
  const need = (map: Record<string, string>, key: string): string => {
    const id = map[key];
    if (!id) throw new Error(`seed: ${key} missing`);
    return id;
  };
  let templatesCreated = 0;
  for (const key of Object.keys(tenancy.orgs) as OrgKey[]) templatesCreated += await seedTemplates(ctx, tenancy.orgs[key], configuredAt);

  const nova = tenancy.orgs.nova;
  const adminUser = tenancy.users.admin;
  const specs = novaSegments(
    { nightShiftSchedule: need(companies.schedules, `nova/${SCHEDULES.nightShift}`), fitOutCompany: need(companies.companies, 'nova/Lumen Electrical Works') },
    { now: ctx.now.getTime() },
  );
  const novaPeopleRows = await novaPeople(ctx, { org: nova, adminUser, people, createdAt: configuredAt, now: ctx.now.getTime(), timezone });
  const [novaCreated, evaluations, syncs] = await seedOrganizationSegments(ctx, {
    org: nova, adminUser, specs, createdAt: configuredAt, timezone, people: novaPeopleRows,
  });
  // Riverside: created now, evaluated once.
  const [riversideCreated, , riversideSyncs] = await seedOrganizationSegments(ctx, {
    org: tenancy.orgs.riverside, adminUser, specs: riversideSegments(), createdAt: Date.now(), timezone, people: null,
  });
  const rulesCreated = await seedSegmentRules(ctx, { org: nova, adminUser, facility: facilities.facilities.nova });
  return {
    templatesCreated,
    segmentsCreated: novaCreated + riversideCreated,
    evaluations,
    syncs: syncs + riversideSyncs,
    rulesCreated,
    durationMs: Date.now() - started,
  };
}
