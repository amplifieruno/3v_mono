import type { TranslationBundle } from '@burojs/i18n-core';

/**
 * The `resources` namespace (English, primary): per-resource documentation
 * the declarations do not carry, such as article titles
 * (`<resource>.doc.topics.<topicId>`). Labels and `doc.summary` texts live on
 * the declarations themselves (`texts`); translations of them go into the
 * other locales' files beside this one.
 */
export default {
  organization_member: {
    doc: { topics: { members: 'Members and invitations' } },
  },
  organization_settings: {
    doc: { topics: { index: 'Organization settings' } },
  },
  company: {
    doc: { topics: { index: 'Companies' } },
  },
  work_schedule: {
    doc: { topics: { index: 'Work schedules and time windows' } },
  },
  custom_attribute_definition: {
    doc: { topics: { index: 'Custom attributes' } },
  },
  facility: {
    doc: { topics: { index: 'Facilities, operating hours, custom attributes and templates' } },
  },
  area: {
    doc: { topics: { index: 'Areas and the area tree' } },
  },
  floor_plan: {
    doc: { topics: { index: 'Floor plans and area shapes' } },
  },
  access_point: {
    doc: { topics: { index: 'Access points, positions and devices' } },
  },
  access_point_device: {
    doc: { topics: { index: 'Devices bound to access points' } },
  },
  facility_template: {
    doc: { topics: { index: 'Facility templates and their structure' } },
  },
  device: {
    doc: { topics: { index: 'Devices, credentials, health, recognition and coverage' } },
  },
  device_area: {
    doc: { topics: { index: 'Areas a device also covers' } },
  },
  device_health_metric: {
    doc: { topics: { index: 'Device health samples and the health chart' } },
  },
  device_event: {
    doc: { topics: { index: 'Device events' } },
  },
  profile: {
    doc: {
      topics: {
        index: 'Profiles: types, status, clearance and activity',
        'profiles-and-identities': 'Profiles and identities',
      },
    },
  },
  profile_document: {
    doc: { topics: { index: 'Profile documents: upload and audited opening' } },
  },
  consent_record: {
    doc: { topics: { index: 'Consent: recording, withdrawing and its effects' } },
  },
  identity: {
    doc: {
      topics: {
        index: 'Identities: sources, photos, enrollment and the profile link',
        governance: 'Merging, splitting, verifying and relating identities; the timeline',
      },
    },
  },
  identity_merge: {
    doc: { topics: { index: 'Identity merges and rolling them back' } },
  },
  identity_duplicate_candidate: {
    doc: { topics: { index: 'Identity duplicates: comparing, merging, dismissing' } },
  },
  verification_request: {
    doc: { topics: { index: 'Verification requests: asking, approving, rejecting' } },
  },
  identity_relationship: {
    doc: { topics: { index: 'Identity relationships' } },
  },
  profile_duplicate_candidate: {
    doc: { topics: { index: 'Profile duplicates: comparing, merging, dismissing' } },
  },
  visit: {
    doc: { topics: { index: 'Visits: scheduling, check-in, check-out and cancelling' } },
  },
  detection: {
    doc: { topics: { index: 'Detections: faces, people and erased rows' } },
  },
  tracking_session: {
    doc: { topics: { index: 'Tracking sessions and their paths' } },
  },
  identity_location: {
    doc: { topics: { index: 'Locations: the steps of a path' } },
  },
  area_occupancy: {
    doc: { topics: { index: 'Who is where and occupancy now' } },
  },
  event: {
    doc: { topics: { index: 'Events: severity, links and live list' } },
  },
  event_rule: {
    doc: { topics: { index: 'Event rules: types, versions, scope and publishing' } },
  },
  event_rule_version: {
    doc: { topics: { index: 'Rule versions' } },
  },
  incident: {
    doc: { topics: { index: 'Incidents: lifecycle, notes, links and timeline' } },
  },
  watch_list: {
    doc: { topics: { index: 'Watch lists: kinds, entries and expiry' } },
  },
  watch_list_entry: {
    doc: { topics: { index: 'Watch-list entries' } },
  },
  shift_handover: {
    doc: { topics: { index: 'Shift handovers: handing over and taking over' } },
  },
  operator_workspace: {
    doc: { topics: { index: 'Operator workspace: panels and arranging them' } },
  },
  notification_rule: {
    doc: { topics: { index: 'Notification rules: event types, conditions, recipients and testing' } },
  },
  notification_template: {
    doc: { topics: { index: 'Notification templates: channels, languages and placeholders' } },
  },
  recipient_group: {
    doc: { topics: { index: 'Recipient groups: people, external addresses and channels' } },
  },
  escalation_policy: {
    doc: { topics: { index: 'Escalation policies: steps, timing and repeats' } },
  },
  on_call_schedule: {
    doc: { topics: { index: 'On-call schedules: the rotation and who is on call now' } },
  },
  notification_subscription: {
    doc: { topics: { index: 'My subscriptions: filters, channel and unsubscribing' } },
  },
  notification_delivery: {
    doc: { topics: { index: 'Deliveries: origin, status, retries and the delivery report' } },
  },
  user_notification: {
    doc: { topics: { index: 'Inbox: the bell, reading and acknowledging' } },
  },
  webhook_subscription: {
    doc: { topics: { index: 'Webhooks: signed requests, allowed addresses and deliveries' } },
  },
  segment: {
    doc: { topics: { index: 'Segments: manual and dynamic, evaluation, trend and archiving' } },
  },
  segment_template: {
    doc: { topics: { index: 'Segment templates: built-in conditions and creating segments' } },
  },
  facility_daily_stat: {
    doc: { topics: { index: 'Analytics: the page, its charts, and facility days' } },
  },
  area_hourly_stat: {
    doc: { topics: { index: 'Hourly figures: people, entries, exits, presence and peak' } },
  },
  area_transition: {
    doc: { topics: { index: 'Moves between areas: the basis of the flow matrix' } },
  },
  dashboard: {
    doc: { topics: { index: 'Dashboards: widgets, sharing, the landing page and what is refused' } },
  },
  report: {
    doc: { topics: { index: 'Reports: types, periods, generation, files, Retry, templates and schedules' } },
  },
  report_schedule: {
    doc: { topics: { index: 'Report schedules: the cron, time zones, runs and failures' } },
  },
  search_request: {
    doc: { topics: { index: 'Face and attribute search: photos, filters, thresholds, match types and history' } },
  },
  saved_search: {
    doc: { topics: { index: 'Saved searches: Run now, schedules, alerts on new matches and the baseline' } },
  },
  bulk_job: {
    doc: { topics: { index: 'Bulk jobs: profile import and update, bulk face search, CSV columns, rows, Cancel and Retry' } },
  },
  access_policy: {
    doc: { topics: { index: 'Access policies: versions, four-eyes approval, roll back, archive and analytics' } },
  },
  access_policy_version: {
    doc: { topics: { index: 'Policy versions: drafts, frozen pending versions, approval and simulation' } },
  },
  access_grant: {
    doc: { topics: { index: 'Access grants: area or access point, validity, single use, revoking' } },
  },
  access_decision: {
    doc: { topics: { index: 'Access decisions: the decision log, how a door decided (the trace) and Test access' } },
  },
  emergency_override: {
    doc: { topics: { index: 'Emergency overrides: lock, unlock, evacuation, justification, ending early, terminals' } },
  },
  terminal_policy_sync: {
    doc: { topics: { index: 'Terminals: policy sync, epochs, Publish policy to terminals and the sync log' } },
  },
  client_application: {
    doc: {
      topics: {
        index: 'Client applications: population, modes, thresholds, attributes, sandbox and status',
        integration: 'Integration: keys, the authentication sequence, signing and what the settings mean for callers',
        keys: 'API keys: rotating a key (the secret shown once), at most two active keys, revoking',
      },
    },
  },
  authentication_session: {
    doc: { topics: { index: 'Authentication sessions: statuses, recaptures, second factors and expiry' } },
  },
  authentication_attempt: {
    doc: { topics: { index: 'Authentication attempts: outcomes, confidence against the threshold, evidence and the review of partial matches' } },
  },
  face_auth_tester: {
    doc: { topics: { index: 'Authenticate a face: testing an application with 3 to 5 frames and reading the decision' } },
  },
  retention_policy: {
    doc: {
      topics: {
        index: 'Retention policies: data classes, class rules, floors, facility policies, activation',
        plan: 'Retention plan: the dry run of the nightly purge, counting rows per class',
      },
    },
  },
  retention_run: {
    doc: { topics: { index: 'Retention runs: what each nightly purge did per class, and the file deletion queue' } },
  },
  legal_hold: {
    doc: { topics: { index: 'Legal holds: what a hold covers, dates that move one way, ending a hold, notices' } },
  },
  data_subject_request: {
    doc: { topics: { index: 'Data subject requests: filing per type, deadlines, the background job, bundles, erasure under legal holds' } },
  },
  processing_activity: {
    doc: { topics: { index: 'Processing activities: legal basis, retention, data classes and the impact assessment (DPIA)' } },
  },
  integration: {
    doc: { topics: { index: 'Integrations: settings, field mapping, schedule, the write-only secret, Run sync and the sync log' } },
  },
  export_definition: {
    doc: { topics: { index: 'Exports: definitions, filters, full and incremental mode, Run now, jobs and owner-only files' } },
  },
  audit_entry: {
    doc: {
      topics: {
        index: 'Audit log: what is recorded, filters, reading a change, redacted secrets, links to records',
        status: 'System status: services, background jobs and their lag, queues, the last retention run',
      },
    },
  },
} satisfies TranslationBundle;
