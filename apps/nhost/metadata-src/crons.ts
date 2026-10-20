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
    // Emergency overrides past ends_at: ended at their ends_at (ended_by NULL, end_reason 'expired') with the
    // emergency_override_ended event, per organization (itap.end_emergency_overrides; apps/backend/src/events/accessCrons.ts).
    name: 'end_emergency_overrides',
    schedule: '* * * * *',
    toleranceSeconds: 120,
    includeInMetadata: true,
    comment: 'End emergency overrides past ends_at (automatic policy restoration) with the ended event',
  },
  {
    // Face authentication sessions: open sessions past expires_at (5 minutes) become expired, per organization
    // (itap.expire_auth_sessions; apps/backend/src/events/authCrons.ts). Review sessions are never touched.
    name: 'expire_auth_sessions',
    schedule: '* * * * *',
    toleranceSeconds: 120,
    includeInMetadata: true,
    comment: 'Mark open face authentication sessions past their expiry as expired',
  },
  {
    // Policy distribution: access terminals behind the urgent epoch now, behind the epoch lazily (last sync older than
    // 15 min); stub transport, real state (apps/backend/src/access/terminalSync.ts). Revocation bound: SA_5 §2.1.4.
    name: 'sync_terminal_policies',
    schedule: '* * * * *',
    toleranceSeconds: 120,
    includeInMetadata: true,
    comment: 'Push policy payloads to access terminals: urgent epochs at once, other changes within 15 minutes',
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
    // Retention (spec §8.3, slice 10): per organization itap.run_retention at scheduled_time (policies, legal holds,
    // resumable batches with a time budget), then the storage deletion queue is drained through the storage API
    // (apps/backend/src/retention). Daily 03:30 UTC; up to an hour late still runs; long timeout for big backlogs.
    name: 'retention_cleanup',
    schedule: '30 3 * * *',
    toleranceSeconds: 3600,
    includeInMetadata: true,
    retry: { num_retries: 2, retry_interval_seconds: 300, timeout_seconds: 600 },
    comment: 'Daily: apply retention policies (delete / anonymize / archive, legal holds) and drain file deletions',
  },
  {
    // Storage deletion queue (slice 10): files queued by retention / erasure are deleted through the storage API every
    // 10 minutes (itap.claim_file_deletions, at most 500 per run; apps/backend/src/retention/fileQueue.ts), besides the
    // drain after the daily retention run.
    name: 'drain_file_deletions',
    schedule: '*/10 * * * *',
    toleranceSeconds: 600,
    includeInMetadata: true,
    comment: 'Delete queued storage files (retention / erasure) through the storage API',
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
    // a trailing window [hour_floor(at - max tracking timeout - 180 s) - 1 h, hour_floor(at)) and the facility-local
    // day(s) it touches (idempotent upserts), so late session closes and a missed run heal on the next run. Activity
    // stats stay with evaluate_segments. Up to an hour late still runs.
    name: 'aggregate_stats',
    schedule: '5 * * * *',
    toleranceSeconds: 3600,
    includeInMetadata: true,
    comment: 'Hourly: area hourly stats, facility daily stats, area transitions of the previous hour',
  },
  {
    // Every 15 minutes (spec §8.3): due report schedules -> reports (previous complete period, one per schedule and
    // period; next runs computed by the backend in the schedule timezone), then reports the render_report trigger left
    // (queued over a minute) or whose generation lease expired.
    name: 'run_report_schedules',
    schedule: '*/15 * * * *',
    toleranceSeconds: 1800,
    includeInMetadata: true,
    comment: 'Run due report schedules and reclaim stalled report generation',
  },
  {
    // Spec §8.3: scheduled saved searches (schedule_cron, organization timezone) run as their owner (skipped when the
    // owner is no longer an active member); saved_search_match events for identities new since the previous run.
    // Missed hours are not replayed (next run strictly after the scheduled time).
    name: 'run_saved_searches',
    schedule: '0 * * * *',
    toleranceSeconds: 3600,
    retry: { num_retries: 2, retry_interval_seconds: 60, timeout_seconds: 600 },
    includeInMetadata: true,
    comment: 'Run due scheduled saved searches and alert on new matches',
  },
  {
    // Every minute: search requests left queued / running for over 10 minutes (a worker died mid-search) are closed as
    // failed 'interrupted'; then bulk jobs the run_bulk_job trigger left queued for over a minute, and running jobs
    // whose lease expired (a worker died): claimed again and resumed after `processed`.
    name: 'resume_bulk_jobs',
    schedule: '* * * * *',
    toleranceSeconds: 120,
    includeInMetadata: true,
    comment: 'Resume stalled bulk jobs (expired leases, missed triggers); close search requests stuck over 10 min',
  },
];
