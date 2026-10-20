/**
 * Pure data of the compliance seed (slice 10): Nova Tower retention policies, legal holds, records of processing
 * activities, data subject requests, integrations (HR fixtures), export definitions and the retention run history.
 *
 * Every retention policy keeps at least RETENTION_MIN_SEED_DAYS: the demo history spans a little over 30 days, so a
 * retention run right after the seed purges nothing (the seed test checks the dry-run plan). The facility-specific
 * policy (CCTV detections at Nova Tower) is the shortest besides the consent window and still longer than the history.
 */
export const RETENTION_MIN_SEED_DAYS = 31;

export type RetentionPolicySpec = { dataClass: string; retainDays: number; action: 'delete' | 'anonymize' | 'archive'; description: string };

/** Organization-wide defaults, one per data class (audit and auth_attempts respect the 365-day floor). */
export const RETENTION_POLICIES: readonly RetentionPolicySpec[] = [
  { dataClass: 'detections', retainDays: 90, action: 'anonymize', description: 'Recognition detections: people unlinked after 90 days' },
  { dataClass: 'locations', retainDays: 90, action: 'delete', description: 'Location trail of tracked people' },
  { dataClass: 'sessions', retainDays: 180, action: 'anonymize', description: 'Tracking sessions keep counts without the person' },
  { dataClass: 'events', retainDays: 365, action: 'anonymize', description: 'Security events: personal references removed after a year' },
  { dataClass: 'deliveries', retainDays: 90, action: 'delete', description: 'Notification deliveries and inbox items' },
  { dataClass: 'webhook_deliveries', retainDays: 60, action: 'delete', description: 'Outgoing webhook delivery log' },
  { dataClass: 'incidents', retainDays: 730, action: 'anonymize', description: 'Closed incidents: two years, then anonymized' },
  { dataClass: 'photos', retainDays: 180, action: 'delete', description: 'Photos of archived unknown identities' },
  { dataClass: 'embeddings_withdrawn', retainDays: RETENTION_MIN_SEED_DAYS, action: 'delete', description: 'Face templates after biometric consent was withdrawn' },
  { dataClass: 'unknown_identities', retainDays: 90, action: 'anonymize', description: 'Unknown faces not seen for 90 days' },
  { dataClass: 'auth_attempts', retainDays: 365, action: 'anonymize', description: 'Face authentication attempts (legal minimum one year)' },
  { dataClass: 'auth_evidence', retainDays: 45, action: 'delete', description: 'Evidence frames of face authentication attempts' },
  { dataClass: 'search_history', retainDays: 180, action: 'delete', description: 'Face and attribute searches' },
  { dataClass: 'bulk_jobs', retainDays: 365, action: 'archive', description: 'Bulk jobs keep the job row, rows and files go' },
  { dataClass: 'reports', retainDays: 365, action: 'archive', description: 'Generated reports expire after a year' },
  { dataClass: 'access_decisions', retainDays: 365, action: 'anonymize', description: 'Door decisions: personal references removed after a year' },
  { dataClass: 'terminal_syncs', retainDays: 90, action: 'delete', description: 'Access terminal policy synchronisation log' },
  { dataClass: 'stats', retainDays: 730, action: 'delete', description: 'Hourly and daily occupancy statistics' },
  { dataClass: 'audit', retainDays: 730, action: 'delete', description: 'Audit trail (legal minimum one year)' },
  { dataClass: 'export_jobs', retainDays: 90, action: 'delete', description: 'Data exports and their files' },
  { dataClass: 'integration_sync_runs', retainDays: 180, action: 'delete', description: 'Integration synchronisation runs' },
];

/** The facility-specific policy (the Nova Tower facility): shorter than the organization-wide detections policy. */
export const FACILITY_POLICY: RetentionPolicySpec = {
  dataClass: 'detections',
  retainDays: 45,
  action: 'delete',
  description: 'Nova Tower camera policy: detections deleted after 45 days',
};

/** Past daily retention runs (03:30 UTC, the retention_cleanup cron) recorded through itap.run_retention. */
export const RETENTION_HISTORY_DAYS = 7;
export const RETENTION_CRON_MINUTES_UTC = 3 * 60 + 30;

export type LegalHoldSpec = { name: string; reason: string; daysAgo: number; target: 'incident' | 'profile' };

export const LEGAL_HOLDS: readonly LegalHoldSpec[] = [
  {
    name: 'Police investigation: blacklist match',
    reason: 'Evidence of the critical blacklist incident requested by the district police; keep until the case is closed.',
    daysAgo: 5,
    target: 'incident',
  },
  {
    name: 'Employment dispute: terminated contractor',
    reason: 'The terminated contractor contests the end of the contract; keep their records until the dispute is settled.',
    daysAgo: 12,
    target: 'profile',
  },
];

export type ProcessingActivitySpec = {
  name: string;
  purpose: string;
  legalBasis: string;
  description: string;
  /** Data class of the retention policy the activity follows. */
  policyClass: string;
  dpiaStatus: 'not_required' | 'required' | 'in_progress' | 'approved';
  /** Lines of the generated DPIA PDF (only for activities with a DPIA document). */
  dpia?: string[];
  dataClasses: string[];
};

export const PROCESSING_ACTIVITIES: readonly ProcessingActivitySpec[] = [
  {
    name: 'Face recognition in common areas',
    purpose: 'Identify enrolled staff and visitors and detect watch-list persons on building cameras',
    legalBasis: 'consent',
    description: 'Biometric templates only for people with a granted biometric consent; unknown faces are kept as unlinked identities.',
    policyClass: 'detections',
    dpiaStatus: 'approved',
    dpia: [
      'DPIA: Face recognition in common areas',
      'Controller: Nova Tower Business Center',
      'Necessity: replaces badge checks at the lobby turnstiles',
      'Risks: misidentification, function creep, unauthorised access to templates',
      'Measures: consent, 45-day CCTV retention, restriction and erasure on request',
      'Outcome: approved by the data protection officer',
    ],
    dataClasses: ['detections', 'locations', 'sessions', 'photos', 'embeddings_withdrawn', 'unknown_identities'],
  },
  {
    name: 'Physical access control',
    purpose: 'Decide door and turnstile access from policies, grants and face credentials',
    legalBasis: 'legitimate_interests',
    description: 'Access decisions are logged for security investigations and anonymized after one year.',
    policyClass: 'access_decisions',
    dpiaStatus: 'approved',
    dpia: [
      'DPIA: Physical access control with face credentials',
      'Controller: Nova Tower Business Center',
      'Necessity: tenant security obligations under the lease agreements',
      'Risks: excessive logging of movements',
      'Measures: decisions anonymized after 365 days, legal holds for investigations',
      'Outcome: approved by the data protection officer',
    ],
    dataClasses: ['access_decisions', 'terminal_syncs', 'events'],
  },
  {
    name: 'Face authentication for tenant applications',
    purpose: 'Sign-in and check-in of employees and visitors by face for client applications',
    legalBasis: 'consent',
    description: 'Attempts are kept for one year as the legal minimum; evidence frames for 45 days.',
    policyClass: 'auth_attempts',
    dpiaStatus: 'in_progress',
    dataClasses: ['auth_attempts', 'auth_evidence'],
  },
  {
    name: 'Security incident management',
    purpose: 'Handle, escalate and report security incidents',
    legalBasis: 'legal_obligation',
    description: 'Incidents and their notifications; closed incidents are anonymized after two years.',
    policyClass: 'incidents',
    dpiaStatus: 'not_required',
    dataClasses: ['incidents', 'events', 'deliveries', 'webhook_deliveries', 'reports'],
  },
  {
    name: 'HR master data synchronisation',
    purpose: 'Keep employee profiles in line with the HR system of record',
    legalBasis: 'contract',
    description: 'Inbound HR feed: profiles are created, updated and deactivated from the HR fixture.',
    policyClass: 'integration_sync_runs',
    dpiaStatus: 'not_required',
    dataClasses: ['integration_sync_runs', 'audit', 'export_jobs'],
  },
];
