import { randomUUID } from 'node:crypto';
import { createHasuraClient } from '../hasura/client.js';
import type { SeedContext } from './tenancy.js';

/**
 * Nova Tower configuration the history replay runs against (seeded before it): the recognition threshold 0.40
 * (avoids the known false blacklist match of the camera faces), watch lists (Blacklist, VIP guests, Watch) and the
 * event rules (five published, one draft). Idempotent: rows are keyed by name; nothing is written on a re-run.
 */
export type HistoryConfigInput = {
  org: string;
  adminUser: string;
  facility: string;
  areas: { lobbyLounge: string; secureFloors: string[] };
  /** Configuration time: before the replay start (watch lists, entries and rules are dated then). */
  configuredAt: number;
  blacklistedProfile: string | null;
  vipProfiles: string[];
  watchedIdentity: string | null;
};

export const RECOGNITION_THRESHOLD = 0.4;

const THRESHOLD = `
  query SeedRecognitionThreshold($org: uuid!) {
    organization_settings(where: { organization_id: { _eq: $org } }) { recognition_threshold }
  }
`;
// Compared in code: the column is real, a Float comparison in SQL would never be equal to 0.4.
const SET_THRESHOLD = `
  mutation SeedSetRecognitionThreshold($org: uuid!, $value: Float!) {
    update_organization_settings(where: { organization_id: { _eq: $org } }, _set: { recognition_threshold: $value }) {
      affected_rows
    }
  }
`;
const UPSERT_LISTS = `
  mutation SeedWatchLists($objects: [watch_lists_insert_input!]!) {
    insert_watch_lists(
      objects: $objects
      on_conflict: { constraint: watch_lists_organization_id_name_key, update_columns: [] }
    ) { affected_rows }
  }
`;
const LISTS = `
  query SeedWatchListRows($org: uuid!) {
    watch_lists(where: { organization_id: { _eq: $org } }) { id name watch_list_entries { identity_id profile_id } }
  }
`;
const INSERT_ENTRIES = `
  mutation SeedWatchListEntries($objects: [watch_list_entries_insert_input!]!) {
    insert_watch_list_entries(objects: $objects) { affected_rows }
  }
`;
const RULES = `query SeedEventRules($org: uuid!) { event_rules(where: { organization_id: { _eq: $org } }) { name } }`;
const RENAME_RULE = `
  mutation SeedRenameEventRule($org: uuid!, $from: String!, $to: String!) {
    update_event_rules(where: { organization_id: { _eq: $org }, name: { _eq: $from } }, _set: { name: $to }) { affected_rows }
  }
`;

type ListSpec = { name: string; kind: string; severity: string; color: string; description: string };
const LISTS_SPEC: ListSpec[] = [
  { name: 'Blacklist', kind: 'blacklist', severity: 'critical', color: '#dc2626', description: 'Not permitted on the premises' },
  { name: 'VIP guests', kind: 'vip', severity: 'info', color: '#7c3aed', description: 'Announce arrival to reception' },
  { name: 'Watch', kind: 'watch', severity: 'medium', color: '#f59e0b', description: 'Unidentified faces under review' },
];

export type RuleSpec = {
  name: string;
  description: string;
  rule_type: string;
  severity: string;
  creates_incident: boolean;
  parameters: Record<string, unknown>;
  /** Scope rows (facility_id or area_id); none = everywhere. */
  scopes: Record<string, string>[];
  publish: boolean;
};

/**
 * Published rules: after hours (facility), restricted areas with incidents on the technical and executive floors
 * (entries elsewhere, e.g. the loading dock, are events only, so a blacklist sighting there opens one incident, not
 * two), "Watch & blacklist match" (watch-list kinds blacklist + watch, incidents), "VIP arrival" (kind vip,
 * announcement only) and "Long wait in the lobby lounge" (unusual_dwell after 40 minutes). One draft: lobby loitering.
 */
export const WATCH_RULE = 'Watch & blacklist match';
/** Rules renamed since earlier seeds (old name -> new name), renamed in place so a re-run does not duplicate them. */
const RENAMED_RULES: Record<string, string> = { 'Blacklist match': WATCH_RULE };

function novaRules(input: HistoryConfigInput): RuleSpec[] {
  const facility = [{ facility_id: input.facility }];
  return [
    { name: 'After-hours presence', description: 'Anyone seen outside the facility operating hours', rule_type: 'after_hours', severity: 'medium', creates_incident: false, parameters: {}, scopes: facility, publish: true },
    { name: 'Restricted area entry', description: 'Entry above clearance on the technical and executive floors', rule_type: 'restricted_area', severity: 'high', creates_incident: true, parameters: {}, scopes: input.areas.secureFloors.map((area_id) => ({ area_id })), publish: true },
    { name: WATCH_RULE, description: 'Blacklist or watch-list match anywhere in Nova Tower', rule_type: 'watchlist', severity: 'critical', creates_incident: true, parameters: { watch_list_kinds: ['blacklist', 'watch'] }, scopes: facility, publish: true },
    { name: 'VIP arrival', description: 'Announce VIP arrivals to reception', rule_type: 'watchlist', severity: 'info', creates_incident: false, parameters: { watch_list_kinds: ['vip'] }, scopes: facility, publish: true },
    { name: 'Long wait in the lobby lounge', description: 'Someone waiting in the lobby lounge for over 40 minutes', rule_type: 'unusual_dwell', severity: 'low', creates_incident: false, parameters: { dwell_seconds: 2400 }, scopes: [{ area_id: input.areas.lobbyLounge }], publish: true },
    { name: 'Lobby loitering', description: 'Long stays in the lobby lounge (draft, under review)', rule_type: 'loitering', severity: 'low', creates_incident: false, parameters: {}, scopes: [{ area_id: input.areas.lobbyLounge }], publish: false },
  ];
}

const HOUR = 3_600_000;

/**
 * One rule per request: header, version (created at `configuredAt`), scopes and, for published rules, the publish
 * call with published_at moved to an hour later (a meta column of a frozen version), in one transaction. Keyed by name.
 */
export async function seedRules(
  ctx: SeedContext,
  target: { org: string; adminUser: string; configuredAt: number },
  specs: RuleSpec[],
): Promise<number> {
  const { org } = target;
  const { event_rules: existing } = await ctx.admin.request<{ event_rules: { name: string }[] }>(RULES, { org });
  const have = new Set(existing.map((r) => r.name));
  const actor = createHasuraClient(ctx.env, { role: 'admin', userId: target.adminUser, organizationId: org });
  const created = new Date(target.configuredAt).toISOString();
  const published = new Date(target.configuredAt + HOUR).toISOString();
  let count = 0;
  for (const spec of specs.filter((r) => !have.has(r.name))) {
    const rule = randomUUID();
    const version = randomUUID();
    const publish = spec.publish
      ? `publish: publish_event_rule_version(args: { p_version: "${version}" }) { id }
         dated: update_event_rule_versions_by_pk(pk_columns: { id: "${version}" }, _set: { published_at: "${published}" }) { id }`
      : '';
    await actor.request(
      `mutation SeedEventRule($rule: event_rules_insert_input!, $v: event_rule_versions_insert_input!,
                              $scopes: [event_rule_version_scopes_insert_input!]!) {
        rule: insert_event_rules_one(object: $rule) { id }
        version: insert_event_rule_versions_one(object: $v) { id }
        scopes: insert_event_rule_version_scopes(objects: $scopes) { affected_rows }
        ${publish}
      }`,
      {
        rule: { id: rule, organization_id: org, name: spec.name, description: spec.description, rule_type: spec.rule_type, created_at: created },
        v: { id: version, organization_id: org, rule_id: rule, severity: spec.severity, creates_incident: spec.creates_incident, parameters: spec.parameters, created_at: created },
        scopes: spec.scopes.map((scope) => ({ organization_id: org, version_id: version, created_at: created, ...scope })),
      },
    );
    count += 1;
  }
  return count;
}

/** Renames rules of earlier seeds in place (only when the new name is still free); a no-op once renamed. */
async function renameRules(ctx: SeedContext, input: HistoryConfigInput): Promise<void> {
  const { org } = input;
  const { event_rules: rules } = await ctx.admin.request<{ event_rules: { name: string }[] }>(RULES, { org });
  const names = new Set(rules.map((r) => r.name));
  const actor = createHasuraClient(ctx.env, { role: 'admin', userId: input.adminUser, organizationId: org });
  for (const [from, to] of Object.entries(RENAMED_RULES)) {
    if (names.has(from) && !names.has(to)) await actor.request(RENAME_RULE, { org, from, to });
  }
}

async function seedWatchLists(ctx: SeedContext, input: HistoryConfigInput): Promise<Record<string, string>> {
  const actor = createHasuraClient(ctx.env, { role: 'admin', userId: input.adminUser, organizationId: input.org });
  const created_at = new Date(input.configuredAt).toISOString();
  await actor.request(UPSERT_LISTS, { objects: LISTS_SPEC.map((l) => ({ ...l, organization_id: input.org, created_at })) });
  type ListRow = { id: string; name: string; watch_list_entries: { identity_id: string | null; profile_id: string | null }[] };
  const { watch_lists: lists } = await ctx.admin.request<{ watch_lists: ListRow[] }>(LISTS, { org: input.org });
  const byName = new Map(lists.map((l) => [l.name, l]));
  const wanted: { list: string; profile_id?: string; identity_id?: string; reason: string }[] = [];
  if (input.blacklistedProfile) wanted.push({ list: 'Blacklist', profile_id: input.blacklistedProfile, reason: 'Building management decision' });
  for (const vip of input.vipProfiles) wanted.push({ list: 'VIP guests', profile_id: vip, reason: 'Tenant executive' });
  if (input.watchedIdentity) wanted.push({ list: 'Watch', identity_id: input.watchedIdentity, reason: 'Repeated unidentified visits' });
  const objects = wanted.flatMap(({ list, ...entry }) => {
    const row = byName.get(list);
    if (!row) throw new Error(`seed: watch list ${list} missing`);
    const exists = row.watch_list_entries.some((e) => e.profile_id === (entry.profile_id ?? null) && e.identity_id === (entry.identity_id ?? null));
    return exists ? [] : [{ ...entry, organization_id: input.org, watch_list_id: row.id, created_at }];
  });
  // Through the seed admin's session: added_by is stamped from the session member.
  if (objects.length > 0) await actor.request(INSERT_ENTRIES, { objects });
  return Object.fromEntries(lists.map((l) => [l.name, l.id]));
}

export async function seedHistoryConfig(
  ctx: SeedContext,
  input: HistoryConfigInput,
): Promise<{ watchLists: Record<string, string>; rulesCreated: number }> {
  const { organization_settings: settings } = await ctx.admin.request<{
    organization_settings: { recognition_threshold: number }[];
  }>(THRESHOLD, { org: input.org });
  if (settings.some((s) => Math.abs(s.recognition_threshold - RECOGNITION_THRESHOLD) > 1e-6)) {
    await ctx.admin.request(SET_THRESHOLD, { org: input.org, value: RECOGNITION_THRESHOLD });
  }
  const watchLists = await seedWatchLists(ctx, input);
  await renameRules(ctx, input);
  const rulesCreated = await seedRules(ctx, { org: input.org, adminUser: input.adminUser, configuredAt: input.configuredAt }, novaRules(input));
  return { watchLists, rulesCreated };
}
