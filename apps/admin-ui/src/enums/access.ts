import { defineEnum } from '@burojs/core';
import { enumValues } from './values';

/* Physical access control enums; values are the rows of the Hasura enum tables in `ACCESS_ENUM_TABLES`. */

export const ACCESS_EFFECT_ENUM = 'access_effect';
export const ACCESS_POLICY_VERSION_STATUS_ENUM = 'access_policy_version_status';
export const ACCESS_DECISION_RESULT_ENUM = 'access_decision_result';
export const ACCESS_DECISION_REASON_ENUM = 'access_decision_reason';
export const OVERRIDE_MODE_ENUM = 'override_mode';
export const TERMINAL_SYNC_RESULT_ENUM = 'terminal_sync_result';

export const ACCESS_EFFECTS = ['allow', 'deny'] as const;
/** The rows of `version_statuses`, read with the meaning they have for access policies (approval). */
export const ACCESS_POLICY_VERSION_STATUSES = ['draft', 'pending_approval', 'published', 'superseded'] as const;
export const ACCESS_DECISION_RESULTS = ['granted', 'denied'] as const;
export const OVERRIDE_MODES = ['lock_all', 'unlock_all', 'evacuation'] as const;
export const TERMINAL_SYNC_RESULTS = ['synced', 'unreachable', 'failed'] as const;
export const ACCESS_DECISION_REASONS = [
  'override_lock',
  'override_unlock',
  'override_evacuation',
  'policy_deny',
  'policy_allow',
  'grant',
  'risk_exceeded',
  'outside_schedule',
  'no_rule',
  'unknown_person',
  'profile_inactive',
  'access_point_unavailable',
] as const;

export const accessEffectEnum = defineEnum({
  name: ACCESS_EFFECT_ENUM,
  values: enumValues(ACCESS_EFFECTS, { allow: 'success', deny: 'destructive' }),
  texts: {
    allow: { label: 'Allow', doc: { summary: 'The people it names may pass the doors it names, within its schedule and validity.' } },
    deny: { label: 'Deny', doc: { summary: 'The people it names are refused at the doors it names, even when another policy or a grant would let them in.' } },
  },
});

/**
 * The version statuses of `version_statuses` as an access policy goes through them: submitted
 * versions wait for a second member's approval and are frozen meanwhile (the event-rule texts
 * of `version_status` say otherwise, so access policies read their own enum over the same table).
 */
export const accessPolicyVersionStatusEnum = defineEnum({
  name: ACCESS_POLICY_VERSION_STATUS_ENUM,
  values: enumValues(ACCESS_POLICY_VERSION_STATUSES, {
    draft: 'secondary',
    pending_approval: 'warning',
    published: 'success',
    superseded: 'outline',
  }),
  texts: {
    draft: { label: 'Draft', doc: { summary: 'Being edited; not enforced. Submitted for approval when ready.' } },
    pending_approval: {
      label: 'Pending approval',
      doc: {
        summary:
          'Submitted and waiting for another member to approve or reject it; frozen meanwhile, so the approver approves exactly what was submitted.',
      },
    },
    published: { label: 'Published', doc: { summary: 'Approved and in force: the doors decide by it.' } },
    superseded: {
      label: 'Superseded',
      doc: { summary: 'Was in force before a later version was approved, or before the policy was archived; kept as history.' },
    },
  },
});

export const accessDecisionResultEnum = defineEnum({
  name: ACCESS_DECISION_RESULT_ENUM,
  values: enumValues(ACCESS_DECISION_RESULTS, { granted: 'success', denied: 'destructive' }),
  texts: {
    granted: { label: 'Granted', doc: { summary: 'The door let the person through.' } },
    denied: { label: 'Denied', doc: { summary: 'The door refused the person.' } },
  },
});

export const accessDecisionReasonEnum = defineEnum({
  name: ACCESS_DECISION_REASON_ENUM,
  values: enumValues(ACCESS_DECISION_REASONS, {
    override_lock: 'destructive',
    override_unlock: 'warning',
    override_evacuation: 'warning',
    policy_deny: 'destructive',
    policy_allow: 'success',
    grant: 'success',
    risk_exceeded: 'destructive',
    outside_schedule: 'secondary',
    no_rule: 'secondary',
    unknown_person: 'secondary',
    profile_inactive: 'secondary',
    access_point_unavailable: 'secondary',
  }),
  texts: {
    override_lock: { label: 'Emergency lock', doc: { summary: 'An emergency override locking every covered door was active.' } },
    override_unlock: { label: 'Emergency unlock', doc: { summary: 'An emergency override unlocking every covered door was active.' } },
    override_evacuation: { label: 'Evacuation', doc: { summary: 'An evacuation override opened this exit.' } },
    policy_deny: { label: 'Denied by a policy', doc: { summary: 'The first matching policy in force denies the person at this door.' } },
    policy_allow: { label: 'Allowed by a policy', doc: { summary: 'The first matching policy in force allows the person at this door.' } },
    grant: { label: 'Access grant', doc: { summary: 'No policy decided, and a valid access grant of the person covers the door.' } },
    risk_exceeded: {
      label: 'Risk too high',
      doc: { summary: 'A policy allowed, but the risk score was above the version’s maximum risk, so the door refused.' },
    },
    outside_schedule: {
      label: 'Outside schedule',
      doc: { summary: 'A policy names the person and the door, but its schedule or validity did not cover the moment.' },
    },
    no_rule: { label: 'No matching rule', doc: { summary: 'No policy in force and no grant covers the person at this door.' } },
    unknown_person: {
      label: 'Unknown person',
      doc: { summary: 'Nobody known was presented: a face without a profile that no policy for faces (identity segment) matched, or nothing at all.' },
    },
    profile_inactive: { label: 'Profile not active', doc: { summary: 'The person’s profile is suspended, inactive or terminated.' } },
    access_point_unavailable: {
      label: 'Door unavailable',
      doc: { summary: 'The access point was inactive or under maintenance.' },
    },
  },
});

/** The override modes' texts: the enum's labels, also the record title of an override. */
export const OVERRIDE_MODE_TEXTS = {
  lock_all: { label: 'Lock all', doc: { summary: 'Every covered door refuses everyone, access grants included.' } },
  unlock_all: { label: 'Unlock all', doc: { summary: 'Every covered door opens for everyone.' } },
  evacuation: {
    label: 'Evacuation',
    doc: { summary: 'Exits open for everyone (even under a lock); entries keep deciding as usual.' },
  },
} as const satisfies Record<(typeof OVERRIDE_MODES)[number], { label: string; doc: { summary: string } }>;

export const overrideModeEnum = defineEnum({
  name: OVERRIDE_MODE_ENUM,
  values: enumValues(OVERRIDE_MODES, { lock_all: 'destructive', unlock_all: 'warning', evacuation: 'warning' }),
  texts: OVERRIDE_MODE_TEXTS,
});

/** The result of one push of the policy to a terminal (`terminal_sync_results`). */
export const terminalSyncResultEnum = defineEnum({
  name: TERMINAL_SYNC_RESULT_ENUM,
  values: enumValues(TERMINAL_SYNC_RESULTS, { synced: 'success', unreachable: 'warning', failed: 'destructive' }),
  texts: {
    synced: { label: 'Synced', doc: { summary: 'The terminal received the rule set and decides by it.' } },
    unreachable: {
      label: 'Unreachable',
      doc: { summary: 'The terminal is offline or unhealthy: nothing was delivered, it keeps its older rule set and is tried again.' },
    },
    failed: { label: 'Failed', doc: { summary: 'The delivery failed (see the error); the terminal is tried again.' } },
  },
});

/** Each enum above by the Hasura enum table holding its values. */
export const ACCESS_ENUM_TABLES: Readonly<Record<string, string>> = {
  [ACCESS_EFFECT_ENUM]: 'access_effects',
  [ACCESS_POLICY_VERSION_STATUS_ENUM]: 'version_statuses',
  [ACCESS_DECISION_RESULT_ENUM]: 'access_decision_results',
  [ACCESS_DECISION_REASON_ENUM]: 'access_decision_reasons',
  [OVERRIDE_MODE_ENUM]: 'override_modes',
  [TERMINAL_SYNC_RESULT_ENUM]: 'terminal_sync_results',
};
