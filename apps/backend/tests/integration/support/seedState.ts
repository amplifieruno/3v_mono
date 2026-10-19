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
  // History (slice 4): the replay is skipped on a second run, the configuration is keyed by name.
  'detections',
  'tracking_sessions',
  'identity_locations',
  'incidents',
  'incident_notes',
  'watch_lists',
  'watch_list_entries',
  'event_rules',
  'event_rule_versions',
  'visits',
  'shift_handovers',
  'shift_handover_incidents',
  'operator_workspaces',
  // Notifications (slice 5): configuration keyed by name; history rows below.
  'notification_templates',
  'recipient_groups',
  'recipient_group_members',
  'on_call_schedules',
  'on_call_schedule_members',
  'escalation_policies',
  'escalation_policy_steps',
  'notification_rules',
  'notification_rule_event_types',
  'notification_rule_channels',
  'notification_subscriptions',
  'webhook_subscriptions',
  'webhook_subscription_event_types',
  'webhook_deliveries',
  // Segments (slice 6): keyed by name. Rule membership rows and daily stats are left out: the live evaluation crons
  // keep them current between two runs.
  'segment_templates',
  'segments',
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
  // A second run must write nothing at all, so no new audit rows or activities either. The live escalate cron keeps
  // escalating the open demo incident (activity with no actor, an audited incident update with no user) and live
  // device events fan out: rows the crons write after the organization was created are left out.
  const created = `(select created_at from itap.organizations where id = ${org})`;
  parts.push(
    `(select count(*) from itap.incident_activities where organization_id = ${org}
       and not (kind = 'escalated' and actor_id is null and occurred_at > ${created})) as incident_activities`,
  );
  parts.push(
    `(select count(*) from itap.audit_log where organization_id = ${org}
       and not (entity = 'incidents' and user_id is null and occurred_at > ${created})) as audit_log`,
  );
  parts.push(`(select count(*) from itap.notification_deliveries where organization_id = ${org} and created_at < ${created}) as seeded_deliveries`);
  parts.push(`(select count(*) from itap.user_notifications where organization_id = ${org} and created_at < ${created}) as seeded_inbox`);
  parts.push(`(select count(*) from itap.segment_members where organization_id = ${org} and source = 'manual') as manual_segment_members`);
  // Pipeline events only (the live device health cron adds device platform events at any time).
  parts.push(`(select count(*) from itap.events where organization_id = ${org} and session_id is not null) as history_events`);
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
