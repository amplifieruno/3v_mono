import { type Check, type Layout, type ScreenPanelNode, defineResource } from '@burojs/core';
import { settingsFields } from './settings-fields';

export { SETTINGS_RANGES, settingsFields } from './settings-fields';

export const SETTINGS_RESOURCE = 'organization_settings';

/** Below this distance recognition is unusually strict (default 0.5, seed 0.4). */
export const STRICT_RECOGNITION_BELOW = 0.35;
/** Above this distance recognition is unusually loose. */
export const LOOSE_RECOGNITION_ABOVE = 0.65;

const threshold = { kind: 'ref', source: 'values', path: ['recognition_threshold'] } as const;

/**
 * `recognition_threshold` is a maximum face distance (`match_face`): a lower value
 * is stricter. Both ends warn before Save, each with what the change does.
 */
export const SETTINGS_CHECKS: Check[] = [
  {
    id: 'lowRecognitionThreshold',
    on: ['edit'],
    severity: 'warning',
    anchor: 'recognition_threshold',
    texts: 'Fewer people will be recognized: faces of known people will more often stay unmatched.',
    when: {
      kind: 'compare',
      op: 'lt',
      left: threshold,
      right: { kind: 'literal', value: STRICT_RECOGNITION_BELOW },
    },
  },
  {
    id: 'highRecognitionThreshold',
    on: ['edit'],
    severity: 'warning',
    anchor: 'recognition_threshold',
    texts:
      'More people will be matched wrongly: different people will more often be taken for each other.',
    when: {
      kind: 'compare',
      op: 'gt',
      left: threshold,
      right: { kind: 'literal', value: LOOSE_RECOGNITION_ABOVE },
    },
  },
];

/**
 * The four panels of both the show and the edit screen. The policy counters sit in
 * `access` beside the writable access settings and are read-only there (`write: 'never'`).
 */
function settingsPanels(l: Layout<typeof settingsFields>): ScreenPanelNode[] {
  return [
    l.panel(
      [
        'recognition_threshold',
        'enrollment_duplicate_threshold',
        'detection_counter_throttle_seconds',
      ],
      {
        key: 'recognition',
        texts: 'Recognition',
      },
    ),
    l.panel(
      [
        'tracking_timeout_seconds',
        'tailgating_window_seconds',
        'abnormal_movement_max_count',
        'abnormal_movement_min_total',
      ],
      { key: 'tracking', texts: 'Tracking and events' },
    ),
    l.panel(
      ['archive_unknown_after_days', 'consent_embedding_retention_days', 'default_retention_days'],
      {
        key: 'retention',
        texts: 'Data lifecycle',
      },
    ),
    l.panel(
      [
        'policy_revocation_bound_seconds',
        'face_credential_cooldown_seconds',
        'policy_epoch',
        'policy_epoch_at',
        'policy_urgent_epoch',
        'policy_urgent_at',
      ],
      { key: 'access', texts: 'Physical access' },
    ),
  ];
}

/**
 * The settings of the current organization: one row per organization, created
 * with it, keyed by `organization_id`. Edited in place by its administrators
 * from the "Settings" page (`./settings-page.ts`); no create, no delete, no list.
 */
export const organizationSettings = defineResource(SETTINGS_RESOURCE, {
  texts: {
    label: 'Organization settings',
    labelPlural: 'Organization settings',
    doc: {
      summary:
        'Thresholds and time limits the platform applies to the whole organization: face matching, tracking sessions, data lifecycle and physical access.',
    },
  },
  operations: { create: false, delete: false },
  builtinActions: { delete: false },
  data: { provider: 'hasura', idField: 'organization_id' },
  fields: settingsFields,
  checks: SETTINGS_CHECKS,
  views: {
    list: { page: false },
    show: {
      body: (l) => [
        ...settingsPanels(l),
        l.panel(['created_at', 'updated_at'], {
          key: 'record',
          texts: 'Record',
          collapse: 'closed',
        }),
      ],
    },
    edit: { body: (l) => settingsPanels(l) },
  },
});
