import type { Rule } from '@burojs/core';

type IdentityRow = {
  readonly status?: unknown;
  readonly is_synthetic?: unknown;
  readonly matching_enabled?: unknown;
};

const row = (record: unknown): IdentityRow => (record ?? {}) as IdentityRow;
const merged = (record: unknown): boolean => row(record).status === 'merged';
const synthetic = (record: unknown): boolean => row(record).is_synthetic === true;
const matchingOff = (record: unknown): boolean => row(record).matching_enabled === false;

/** Why a merged identity cannot change (beside every disabled field and action). */
export const MERGED_REASON =
  'This identity was merged into another one: it is frozen with its history until the merge is rolled back.';

/** Why a synthetic identity has no profile link. */
export const SYNTHETIC_REASON =
  'A synthetic test identity of the face authentication sandbox is never linked to a profile.';

/** Why no photos can be added while matching is off. */
export const MATCHING_OFF_REASON =
  'Matching is off because the person withdrew biometric consent: no new face data can be stored.';

/** The profile link fields, refused on a synthetic identity (`identities_link` guards). */
const LINK_FIELDS = ['profile_id', 'link_strength', 'is_primary_for_profile'];

/**
 * What the database refuses, shown before anything is sent: a merged identity is frozen
 * (`identities_reserved_values`, and its status cannot leave `merged` outside a rollback), a
 * synthetic identity never links to a profile, and an identity whose matching is off takes no
 * new photos (`add_identity_photos` refuses it).
 */
export const IDENTITY_RULES: Rule[] = [
  {
    target: { kind: 'field' },
    deny: 'edit',
    when: (ctx) => merged(ctx.record),
    fallback: 'disable',
    reason: MERGED_REASON,
  },
  {
    target: { kind: 'action', name: ['edit', 'add_photos'] },
    deny: 'run',
    when: (ctx) => merged(ctx.record),
    fallback: 'disable',
    reason: MERGED_REASON,
  },
  {
    target: { kind: 'field', name: LINK_FIELDS },
    deny: 'edit',
    when: (ctx) => synthetic(ctx.record),
    fallback: 'disable',
    reason: SYNTHETIC_REASON,
  },
  {
    target: { kind: 'action', name: 'add_photos' },
    deny: 'run',
    when: (ctx) => matchingOff(ctx.record),
    fallback: 'disable',
    reason: MATCHING_OFF_REASON,
  },
];
