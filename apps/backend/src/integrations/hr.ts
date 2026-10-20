import type { HasuraClient } from '../hasura/client.js';
import { mapRecord, PROFILE_TARGETS, type MappedRecord } from './fixture.js';

/**
 * HR fixture application (spec §8.4 run_sync): profiles keyed by (source_integration_id, external_id) are created,
 * updated (only changed columns) or deactivated (present before, absent from the fixture -> status inactive), so a
 * second run with the same fixture writes nothing. Writes go through Hasura with the `writer` client (an
 * organization-scoped admin session whose audit reason is the synthetic actor `integration:<code>`), so profile
 * triggers, CHECKs and audit apply. A record that cannot be applied is skipped with a code (never its values).
 */

export type SyncCounts = {
  records_in: number;
  records_out: number;
  created: number;
  updated: number;
  deactivated: number;
  skipped: number;
  errors: { row: number; code: string }[];
};

type Existing = Record<string, unknown> & {
  id: string;
  external_id: string;
  status: string;
  erased_at: string | null;
  custom_fields: Record<string, unknown>;
};

const MAX_ERRORS = 50;
const COLUMNS = ['id', 'external_id', 'status', 'erased_at', 'custom_fields', ...PROFILE_TARGETS.filter((c) => c !== 'status')].join(' ');

const EXISTING = `
  query HrSyncProfiles($org: uuid!, $integration: uuid!) {
    profiles(where: { organization_id: { _eq: $org }, source_integration_id: { _eq: $integration } }) { ${COLUMNS} }
  }
`;
const INSERT = `
  mutation HrSyncInsert($o: profiles_insert_input!) { insert_profiles_one(object: $o) { id } }
`;
const UPDATE = `
  mutation HrSyncUpdate($org: uuid!, $id: uuid!, $set: profiles_set_input!) {
    update_profiles(where: { organization_id: { _eq: $org }, id: { _eq: $id } }, _set: $set) { affected_rows }
  }
`;

/** Columns (and merged custom_fields) whose value differs from the existing profile. */
function changes(existing: Existing, mapped: MappedRecord): Record<string, unknown> {
  const set: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(mapped.fields)) {
    if ((existing[column] ?? null) !== value) set[column] = value;
  }
  // A person back in the HR feed is active again (unless the feed sets the status itself).
  if (!('status' in mapped.fields) && existing.status === 'inactive') set.status = 'active';
  const custom = { ...existing.custom_fields };
  let customChanged = false;
  for (const [key, value] of Object.entries(mapped.customFields)) {
    if ((custom[key] ?? null) !== value) {
      customChanged = true;
      if (value === null) delete custom[key];
      else custom[key] = value;
    }
  }
  if (customChanged) set.custom_fields = custom;
  return set;
}

export async function applyHrFixture(args: {
  organizationId: string;
  integrationId: string;
  records: unknown[];
  mapping: Record<string, string>;
  externalIdField: string;
  reader: HasuraClient;
  writer: HasuraClient;
}): Promise<SyncCounts> {
  const { organizationId: org, integrationId } = args;
  const counts: SyncCounts = { records_in: args.records.length, records_out: 0, created: 0, updated: 0, deactivated: 0, skipped: 0, errors: [] };
  const skip = (row: number, code: string) => {
    counts.skipped += 1;
    if (counts.errors.length < MAX_ERRORS) counts.errors.push({ row, code });
  };
  const { profiles } = await args.reader.request<{ profiles: Existing[] }>(EXISTING, { org, integration: integrationId });
  const byExternalId = new Map(profiles.map((p) => [p.external_id, p]));
  const seen = new Set<string>();

  for (const [index, record] of args.records.entries()) {
    const row = index + 1;
    const mapped = mapRecord(record, args.mapping, args.externalIdField);
    if ('error' in mapped) {
      skip(row, mapped.error);
      continue;
    }
    if (seen.has(mapped.externalId)) {
      skip(row, 'duplicate_external_id');
      continue;
    }
    seen.add(mapped.externalId);
    const existing = byExternalId.get(mapped.externalId);
    try {
      if (existing) {
        if (existing.erased_at) {
          skip(row, 'profile_erased');
          continue;
        }
        const set = changes(existing, mapped);
        if (Object.keys(set).length === 0) continue;
        await args.writer.request(UPDATE, { org, id: existing.id, set });
        counts.updated += 1;
      } else {
        if (!mapped.fields.first_name || !mapped.fields.last_name) {
          skip(row, 'missing_name');
          continue;
        }
        const object = {
          ...mapped.fields,
          organization_id: org,
          source_integration_id: integrationId,
          external_id: mapped.externalId,
          custom_fields: Object.fromEntries(Object.entries(mapped.customFields).filter(([, v]) => v !== null)),
        };
        await args.writer.request(INSERT, { o: object });
        counts.created += 1;
      }
    } catch {
      skip(row, 'write_failed');
    }
  }

  for (const p of profiles) {
    if (seen.has(p.external_id) || p.erased_at || p.status === 'inactive' || p.status === 'terminated') continue;
    await args.writer.request(UPDATE, { org, id: p.id, set: { status: 'inactive' } });
    counts.deactivated += 1;
  }
  counts.records_out = counts.created + counts.updated + counts.deactivated;
  return counts;
}
