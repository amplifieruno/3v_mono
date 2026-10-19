import { runSqlRows } from './sql.js';

/** Row counts of the seeded tables of one organization, keyed by table (plus derived counts). */
export type SeedCounts = Record<string, number>;

const TABLES = [
  'companies',
  'work_schedules',
  'custom_attribute_definitions',
  'profiles',
  'consent_records',
  'profile_documents',
  'identities',
  'identity_photos',
  'identity_embeddings',
  'verification_requests',
  'identity_duplicate_candidates',
  'identity_merges',
  'facilities',
  'areas',
  'floor_plans',
  'access_points',
  'devices',
  'device_areas',
  'access_point_devices',
  'facility_templates',
  // A second run must write nothing at all, so no new audit rows either.
  'audit_log',
];

/** Counts every seeded table of the organization with the given slug, plus storage files and derived counts. */
export async function seedCounts(slug: string): Promise<SeedCounts> {
  const org = `(select id from itap.organizations where slug = '${slug}')`;
  const parts = TABLES.map((t) => `(select count(*) from itap.${t} where organization_id = ${org}) as ${t}`);
  parts.push(`(select count(*) from storage.files where bucket_id = ${org}::text) as files`);
  parts.push(
    `(select count(distinct identity_id) from itap.identity_embeddings where is_template and organization_id = ${org})
       as identities_with_templates`,
  );
  parts.push(
    `(select count(*) from itap.profiles where organization_id = ${org} and profile_type = 'vip' and identities_count > 0)
       as vips_with_face`,
  );
  parts.push(`(select count(*) from itap.identities where organization_id = ${org} and source = 'camera') as camera_identities`);
  parts.push(
    `(select count(*) from itap.consent_records where organization_id = ${org} and status = 'withdrawn') as withdrawn_consents`,
  );
  // Telemetry the seed wrote (before the device row existed); the live health cron keeps adding samples after that.
  parts.push(
    `(select count(*) from itap.device_health_metrics m join itap.devices d on d.id = m.device_id
       where m.organization_id = ${org} and m.recorded_at < d.created_at) as seeded_health_metrics`,
  );
  parts.push(
    `(select count(*) from itap.device_events e join itap.devices d on d.id = e.device_id
       where e.organization_id = ${org} and e.occurred_at < d.created_at) as seeded_device_events`,
  );
  parts.push(
    `(select count(*) from itap.devices where organization_id = ${org} and stream_url is not null) as streaming_cameras`,
  );
  parts.push(
    `(select count(*) from itap.identity_photos where organization_id = ${org} and device_id is not null) as photos_with_device`,
  );
  parts.push(
    `(select count(*) from itap.floor_plans where organization_id = ${org} and image_file_id is not null) as floor_plans_with_image`,
  );
  parts.push(`(select count(*) from itap.areas where organization_id = ${org} and shape is not null) as areas_with_shape`);
  const [row] = await runSqlRows(`select ${parts.join(', ')}`);
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)]));
}

/** One template of a seeded identity linked to a profile: its identity id and embedding literal. */
export async function seededTemplate(slug: string): Promise<{ identityId: string; embedding: string }> {
  const [row] = await runSqlRows(
    `select e.identity_id, e.embedding::text as embedding
       from itap.identity_embeddings e
       join itap.identities i on i.id = e.identity_id
       join itap.organizations o on o.id = e.organization_id
      where o.slug = '${slug}' and e.is_template and i.profile_id is not null
      order by i.number, e.id limit 1`,
  );
  if (!row?.identity_id || !row.embedding) throw new Error(`No seeded template in ${slug}`);
  return { identityId: row.identity_id, embedding: row.embedding };
}
