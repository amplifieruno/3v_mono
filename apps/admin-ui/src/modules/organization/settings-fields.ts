import { f } from '@burojs/field-types';
import { boundedNumber, type NumberRange } from '../../fields/bounded-number';

/**
 * The accepted range of every writable setting. Where the column has a CHECK
 * constraint the range is exactly that constraint (marked `db`); the others have
 * no CHECK in the database and the range is the console's own sanity limit.
 */
export const SETTINGS_RANGES = {
  recognition_threshold: { min: 0.1, max: 0.9 },
  enrollment_duplicate_threshold: { min: 0.1, max: 0.9 },
  detection_counter_throttle_seconds: { min: 0, max: 3600, integer: true },
  tracking_timeout_seconds: { min: 30, max: 86_400, integer: true },
  tailgating_window_seconds: { min: 1, max: 300, integer: true },
  /** db: `abnormal_movement_max_count >= 0`. */
  abnormal_movement_max_count: { min: 0, max: 1000, integer: true },
  /** db: `abnormal_movement_min_total >= 1`. */
  abnormal_movement_min_total: { min: 1, max: 100_000, integer: true },
  archive_unknown_after_days: { min: 1, max: 36_500, integer: true },
  default_retention_days: { min: 1, max: 36_500, integer: true },
  /** db: 1..3650. */
  consent_embedding_retention_days: { min: 1, max: 3650, integer: true },
  /** db: 10..3600. */
  policy_revocation_bound_seconds: { min: 10, max: 3600, integer: true },
  /** db: 1..3600. */
  face_credential_cooldown_seconds: { min: 1, max: 3600, integer: true },
} as const satisfies Record<string, NumberRange>;

/** Counters and timestamps the platform writes: shown, never editable. */
const COUNTER = { write: 'never', in: ['show', 'edit'] } as const;

/**
 * Columns of `itap.organization_settings` the `org_admin` role reads; the twelve
 * numbers are the role's update columns, the policy epochs are written by the
 * access engine only. Meanings: data-layer design §6.1, §6.13, §6.14, §8.
 */
export const settingsFields = {
  organization_id: f.uuid({ system: true, texts: 'Organization', in: [] }),
  recognition_threshold: boundedNumber({
    ...SETTINGS_RANGES.recognition_threshold,
    texts: {
      label: 'Recognition threshold',
      description:
        'Largest face distance that still counts as the same person (0.1–0.9, default 0.5).',
      doc: {
        summary:
          'Live recognition matches a detected face to the nearest enrolled identity only when their distance is at most this value. ' +
          'Lower is stricter: fewer wrong matches, more people left unrecognized. Face search uses 1 minus this value as its default similarity.',
      },
    },
  }),
  enrollment_duplicate_threshold: boundedNumber({
    ...SETTINGS_RANGES.enrollment_duplicate_threshold,
    texts: {
      label: 'Duplicate threshold at enrollment',
      description:
        'Largest face distance at which a new photo is reported as an existing identity (0.1–0.9, default 0.5).',
      doc: {
        summary:
          'When photos are enrolled, a face this close to an existing identity is reported as a possible duplicate instead of creating a new identity. ' +
          'Independent of the recognition threshold.',
      },
    },
  }),
  detection_counter_throttle_seconds: boundedNumber({
    ...SETTINGS_RANGES.detection_counter_throttle_seconds,
    texts: {
      label: 'Detection counter interval',
      description:
        'Seconds between updates of an identity’s detection count and last-seen time (default 10).',
      doc: {
        summary:
          'Each detection is stored, but the identity’s counters are written at most once per this many seconds, which keeps busy identities cheap to update. ' +
          'The count stays exact; only its refresh is delayed.',
      },
    },
  }),
  tracking_timeout_seconds: boundedNumber({
    ...SETTINGS_RANGES.tracking_timeout_seconds,
    texts: {
      label: 'Tracking timeout',
      description: 'Seconds without a detection after which a tracking session ends (default 300).',
      doc: {
        summary:
          'A person not seen for this long has left: the next detection opens a new session, and the stale-session job closes sessions of people who never came back, ' +
          'as completed after an exit door, otherwise as lost. Statistics wait this long before counting an hour.',
      },
    },
  }),
  tailgating_window_seconds: boundedNumber({
    ...SETTINGS_RANGES.tailgating_window_seconds,
    texts: {
      label: 'Tailgating window',
      description:
        'Seconds around a granted passage in which extra people at the same door raise tailgating (default 5).',
      doc: {
        summary:
          'Within plus or minus this many seconds of a granted access decision, more people at the door than granted decisions raise a high-severity tailgating event.',
      },
    },
  }),
  abnormal_movement_max_count: boundedNumber({
    ...SETTINGS_RANGES.abnormal_movement_max_count,
    texts: {
      label: 'Abnormal movement: rare transition',
      description:
        'A move between two areas seen at most this often in the last 30 days is abnormal (default 1).',
      doc: {
        summary:
          'Raises an abnormal movement event when a transition between two areas happened at most this many times in the previous 30 days, ' +
          'provided both areas are busy enough (the minimum traffic below).',
      },
    },
  }),
  abnormal_movement_min_total: boundedNumber({
    ...SETTINGS_RANGES.abnormal_movement_min_total,
    texts: {
      label: 'Abnormal movement: minimum traffic',
      description:
        'Departures from the source area and arrivals in the target area needed over 30 days (default 20).',
      doc: {
        summary:
          'Rare transitions are only judged between areas with at least this much traffic, so quiet areas do not raise abnormal movement events.',
      },
    },
  }),
  archive_unknown_after_days: boundedNumber({
    ...SETTINGS_RANGES.archive_unknown_after_days,
    texts: {
      label: 'Archive unknown identities after',
      description:
        'Days without a detection after which an unknown identity is archived (default 90).',
      doc: {
        summary:
          'The daily lifecycle job archives unknown identities (not linked to a profile) that were not seen for this many days. Archived identities are no longer matched.',
      },
    },
  }),
  default_retention_days: boundedNumber({
    ...SETTINGS_RANGES.default_retention_days,
    texts: {
      label: 'Default retention (unused)',
      description: 'Not used: data without a retention policy is kept.',
      doc: {
        summary:
          'Kept for compatibility and read by nothing. How long each kind of data is kept is set by retention policies; data without a policy is kept.',
      },
    },
  }),
  consent_embedding_retention_days: boundedNumber({
    ...SETTINGS_RANGES.consent_embedding_retention_days,
    texts: {
      label: 'Face templates after consent withdrawal',
      description:
        'Days face templates are kept after consent is withdrawn, when no retention policy covers them (default 30).',
      doc: {
        summary:
          'A withdrawn consent stops matching at once; the templates themselves are purged after this many days unless a retention policy for withdrawn templates says otherwise.',
      },
    },
  }),
  policy_revocation_bound_seconds: boundedNumber({
    ...SETTINGS_RANGES.policy_revocation_bound_seconds,
    texts: {
      label: 'Revocation bound',
      description:
        'Seconds within which a narrowing access change must reach every reachable terminal (default 60).',
      doc: {
        summary:
          'An urgent policy change (revoked grant, deny published, override) is pushed to terminals at once; terminal sync status reports a terminal as late when it has not applied it within this many seconds.',
      },
    },
  }),
  face_credential_cooldown_seconds: boundedNumber({
    ...SETTINGS_RANGES.face_credential_cooldown_seconds,
    texts: {
      label: 'Face credential cooldown',
      description:
        'Seconds during which the same person at the same door gets no second access decision (default 10).',
      doc: {
        summary:
          'At a door whose camera is a face credential reader, a person standing in view is decided once: further detections within this many seconds reuse the decision.',
      },
    },
  }),
  policy_epoch: f.number({
    ...COUNTER,
    texts: {
      label: 'Policy version',
      doc: {
        summary:
          'Counter raised by every change that affects access decisions; terminals report the version they have applied.',
      },
    },
  }),
  policy_epoch_at: f.dateTime({
    ...COUNTER,
    nullable: true,
    texts: {
      label: 'Policy version changed',
      doc: { summary: 'When the policy version was last raised.' },
    },
  }),
  policy_urgent_epoch: f.number({
    ...COUNTER,
    texts: {
      label: 'Urgent policy version',
      doc: {
        summary:
          'The last policy version that narrowed access (a revocation); terminals below it are synced at once and measured against the revocation bound.',
      },
    },
  }),
  policy_urgent_at: f.dateTime({
    ...COUNTER,
    nullable: true,
    texts: {
      label: 'Urgent change at',
      doc: { summary: 'When the last access-narrowing change happened.' },
    },
  }),
  created_at: f.dateTime({ system: true, in: ['show'], texts: 'Created' }),
  updated_at: f.dateTime({ system: true, in: ['show'], texts: 'Updated' }),
};
