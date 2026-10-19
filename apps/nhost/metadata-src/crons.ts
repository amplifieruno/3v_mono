import type { CronSpec } from './types.js';

/**
 * Hasura cron triggers (design §8.3); `metadata:generate` writes them to `cron_triggers.yaml`. Each is handled by the
 * backend at `/hasura/events/<name>` (apps/backend/src/events), which calls SQL functions per organization.
 */
export const crons: CronSpec[] = [
  {
    // Wiring/health proof for the cron pipeline: the handler records nothing and answers ok.
    name: 'heartbeat',
    schedule: '*/5 * * * *',
    includeInMetadata: true,
    comment: 'Cron pipeline health check; the backend handler writes nothing',
  },
  {
    // Real probes of the stream-server per active camera (apps/backend/src/events/deviceHealthCheck.ts). A run older
    // than 2 minutes is stale (the next one is due), so Hasura drops it instead of delivering it late.
    name: 'device_health_check',
    schedule: '* * * * *',
    toleranceSeconds: 120,
    includeInMetadata: true,
    comment: 'Probe the stream-server per camera: metrics, health_status, last_seen_at, device_events',
  },
  {
    // Tracking sessions of people who never came back (spec §8.3): closed per organization at scheduled_time by
    // itap.close_stale_sessions (apps/backend/src/events/trackingCrons.ts).
    name: 'close_stale_sessions',
    schedule: '*/2 * * * *',
    toleranceSeconds: 120,
    includeInMetadata: true,
    comment: 'Close active tracking sessions idle longer than the tracking timeout; clear their occupancy',
  },
  {
    // Time-based events (loitering, unusual_dwell) from area_occupancy durations at scheduled_time, per
    // organization (itap.evaluate_dwell_rules).
    name: 'evaluate_dwell_rules',
    schedule: '* * * * *',
    toleranceSeconds: 120,
    includeInMetadata: true,
    comment: 'Loitering / unusual dwell events from occupancy durations',
  },
  {
    // Daily housekeeping per organization at scheduled_time (itap.run_lifecycle_jobs): no-show visits, expired
    // visitor/contractor profiles, expired invitations. Runs 03:00 UTC; a run up to an hour late is still delivered.
    name: 'lifecycle_jobs',
    schedule: '0 3 * * *',
    toleranceSeconds: 3600,
    includeInMetadata: true,
    comment: 'Daily: no-show visits, expire visitor/contractor profiles past end_date, expire invitations',
  },
  {
    // Hasura's event/cron delivery logs grow with every detection (detection_created): delete finished rows older
    // than 3 days, for every trigger (itap.purge_trigger_logs). Daily 03:30 UTC; up to an hour late still runs.
    name: 'purge_trigger_logs',
    schedule: '30 3 * * *',
    toleranceSeconds: 3600,
    includeInMetadata: true,
    comment: 'Daily: delete delivered/failed event trigger and cron logs older than 3 days',
  },
  {
    // Failed notification deliveries (stubbed channels) whose backoff passed: claimed and sent again
    // (itap.due_notification_deliveries / claim_notification_delivery; apps/backend/src/events/sending.ts).
    name: 'retry_deliveries',
    schedule: '* * * * *',
    toleranceSeconds: 120,
    includeInMetadata: true,
    comment: 'Retry notification deliveries in retrying state whose deliver_after passed',
  },
  {
    // Webhook deliveries whose backoff (30 s, 2 min, 10 min, 30 min) passed, or whose first attempt never ran.
    name: 'retry_webhooks',
    schedule: '* * * * *',
    toleranceSeconds: 120,
    includeInMetadata: true,
    comment: 'Retry webhook deliveries whose next_attempt_at passed; dead_letter after 5 attempts',
  },
  {
    // Unacknowledged open incidents: the next escalation step of their policy once its after_minutes passed, one step
    // per incident per run (itap.escalate_incidents per organization; apps/backend/src/events/notificationCrons.ts).
    name: 'escalate',
    schedule: '* * * * *',
    toleranceSeconds: 120,
    includeInMetadata: true,
    comment: 'Escalate unacknowledged open incidents to the next step of their escalation policy',
  },
  {
    // Digest-mode notification rules: due digest items combined per rule, recipient, channel and window into one
    // delivery (itap.send_digests per organization). Hourly; a run up to an hour late is still delivered.
    name: 'send_digests',
    schedule: '0 * * * *',
    toleranceSeconds: 3600,
    includeInMetadata: true,
    comment: 'Combine due digest items of digest-mode notification rules into one delivery per recipient',
  },
  {
    // Debounced segment evaluation (slice 6): organizations whose segment inputs changed at least 30 s ago
    // (itap.segment_evaluation_requests) get their dynamic segments evaluated at scheduled_time
    // (apps/backend/src/segments/crons.ts).
    name: 'evaluate_segments_pending',
    schedule: '* * * * *',
    toleranceSeconds: 120,
    includeInMetadata: true,
    comment: 'Evaluate dynamic segments of organizations whose segment inputs changed (30 s debounce)',
  },
  {
    // Hourly per organization: refresh_activity_stats at scheduled_time, every dynamic segment (time windows, schedules,
    // behavioral metrics) and segment_daily_stats at max(scheduled_time, now) (daily stats also at scheduled_time first
    // when the run is over a minute late). A retry re-syncs to the same membership; up to an hour late runs.
    name: 'evaluate_segments',
    schedule: '0 * * * *',
    toleranceSeconds: 3600,
    includeInMetadata: true,
    comment: 'Hourly: activity stats, dynamic segment evaluation, segment daily stats',
  },
  {
    // Hourly at minute 5 (the hour has closed): itap.aggregate_stats(org, scheduled_time) per organization re-aggregates
    // the previous UTC hour and the facility-local day(s) it touches (idempotent upserts). Activity stats stay with
    // evaluate_segments. Up to an hour late still runs; a missed hour is re-aggregated by the next seed / manual range.
    name: 'aggregate_stats',
    schedule: '5 * * * *',
    toleranceSeconds: 3600,
    includeInMetadata: true,
    comment: 'Hourly: area hourly stats, facility daily stats, area transitions of the previous hour',
  },
];
