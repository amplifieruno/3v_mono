import { createHash } from 'node:crypto';
import type { HasuraClient } from '../hasura/client.js';
import { mapRecord, PROFILE_TARGETS, type MappedRecord } from './fixture.js';

/**
 * HR fixture application (spec §8.4 run_sync): profiles keyed by (source_integration_id, external_id) are created,
 * updated (only changed columns) or deactivated (present before, absent from the fixture -> status inactive), so a
 * second run with the same fixture writes nothing. Writes go through Hasura with the `writer` client (an
 * organization-scoped admin session whose audit reason is the synthetic actor `integration:<code>`), so profile
 * triggers, CHECKs and audit apply. A record that cannot be applied is skipped with a code (never its values).
 * People erased by a DSR are suppressed (their key hash is in integration_suppressions: never recreated), profiles
 * under restriction of processing are neither updated nor deactivated (Art. 18). The job renews its lease every
 * RENEW_EVERY records (`renew` false = the run was taken over: stop).
 */

export type SyncCounts = {
  records_in: number;
  records_out: number;
  created: number;
  updated: number;
  deactivated: number;
  skipped: number;
  skipped_suppressed: number;
  skipped_restricted: number;
  errors: { row?: number; code: string }[];
};

type Existing = Record<string, unknown> & {
  id: string;
  external_id: string;
  status: string;
  erased_at: string | null;
  processing_restricted: boolean;
  custom_fields: Record<string, unknown>;
};

const MAX_ERRORS = 50;
export const RENEW_EVERY = 100;
const COLUMNS = ['id', 'external_id', 'status', 'erased_at', 'processing_restricted', 'custom_fields', ...PROFILE_TARGETS.filter((c) => c !== 'status')].join(' ');

const EXISTING = `
  query HrSyncProfiles($org: uuid!, $integration: uuid!) {
    profiles(where: { organization_id: { _eq: $org }, source_integration_id: { _eq: $integration } }) { ${COLUMNS} }
    integration_suppressions(where: { organization_id: { _eq: $org }, integration_id: { _eq: $integration } }) { key_hash }
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

/** Same key as itap.integration_suppression_key: sha256("<integration id>:<external id>"), hex. */
export function suppressionKey(integrationId: string, externalId: string): string {
  return createHash('sha256').update(`${integrationId.toLowerCase()}:${externalId}`, 'utf8').digest('hex');
}

export async function applyHrFixture(args: {
  organizationId: string;
  integrationId: string;
  records: unknown[];
  mapping: Record<string, string>;
  externalIdField: string;
  reader: HasuraClient;
  writer: HasuraClient;
  /** Extends the run's lease; false when the run is no longer this attempt's. */
  renew?: () => Promise<boolean>;
}): Promise<SyncCounts> {
  const { organizationId: org, integrationId } = args;
  const counts: SyncCounts = {
    records_in: args.records.length, records_out: 0, created: 0, updated: 0, deactivated: 0, skipped: 0,
    skipped_suppressed: 0, skipped_restricted: 0, errors: [],
  };
  const skip = (row: number | undefined, code: string) => {
    counts.skipped += 1;
    if (counts.errors.length < MAX_ERRORS) counts.errors.push(row === undefined ? { code } : { row, code });
  };
  const renew = async (done: number) => {
    if (done > 0 && done % RENEW_EVERY === 0 && args.renew && !(await args.renew())) throw new Error('lease_lost');
  };
  const { profiles, integration_suppressions: suppressions } = await args.reader.request<{
    profiles: Existing[];
    integration_suppressions: { key_hash: string }[];
  }>(EXISTING, { org, integration: integrationId });
  const suppressed = new Set(suppressions.map((x) => x.key_hash));
  const byExternalId = new Map(profiles.map((p) => [p.external_id, p]));
  const seen = new Set<string>();

  for (const [index, record] of args.records.entries()) {
    await renew(index);
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
    if (suppressed.has(suppressionKey(integrationId, mapped.externalId))) {
      counts.skipped_suppressed += 1;
      continue;
    }
    const existing = byExternalId.get(mapped.externalId);
    try {
      if (existing) {
        if (existing.erased_at) {
          counts.skipped_suppressed += 1;
          continue;
        }
        if (existing.processing_restricted) {
          counts.skipped_restricted += 1;
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

  let done = 0;
  for (const p of profiles) {
    if (seen.has(p.external_id) || p.erased_at || p.status === 'inactive' || p.status === 'terminated') continue;
    if (p.processing_restricted) {
      counts.skipped_restricted += 1;
      continue;
    }
    done += 1;
    await renew(done);
    try {
      await args.writer.request(UPDATE, { org, id: p.id, set: { status: 'inactive' } });
      counts.deactivated += 1;
    } catch {
      skip(undefined, 'deactivate_failed');
    }
  }
  counts.records_out = counts.created + counts.updated + counts.deactivated;
  return counts;
}
