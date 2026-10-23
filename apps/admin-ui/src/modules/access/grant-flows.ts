import { type Check, type FlowConfig, type FlowUnknownCheck, type Rule, type RuleContext, cond, isRecordProbe, ref } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { ACCESS_GRANT_RESOURCE } from '../../data/resource-names';
import { checkNotBlank } from '../../fields/not-blank';
import { revokeAccessGrant } from './grant-ops';

type Row = Readonly<Record<string, unknown>> | null | undefined;

const present = (value: unknown): boolean => value !== null && value !== undefined && value !== '';

/** The instant of a date-time value, or `null`. */
const instant = (value: unknown): number | null => {
  if (typeof value !== 'string' || value === '') return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : at;
};

/** Whether a grant's window is over (`valid_until` passed): nothing is left to revoke. */
export function grantExpired(record: Row, now: number = Date.now()): boolean {
  const until = instant(record?.valid_until);
  return until !== null && until <= now;
}

/** Why "Revoke" is not offered on an expired grant. */
export const EXPIRED_REASON = 'The grant has expired: it opens nothing any more, so there is nothing to revoke.';

/** "Revoke" is not offered on an expired grant (a rule with the reason). */
export const GRANT_RULES: Rule[] = [
  {
    target: { kind: 'action', name: 'revoke' },
    deny: 'run',
    when: (ctx: Pick<RuleContext, 'record'>) =>
      !isRecordProbe(ctx.record) && typeof (ctx.record as Row)?.id === 'string' && grantExpired(ctx.record as Row),
    fallback: 'disable',
    reason: EXPIRED_REASON,
  },
];

/**
 * The create form's checks, restating `access_grants_exactly_one_target` (an area or an access
 * point, not both) and `access_grants_valid_window` (Valid until after Valid from).
 */
export const GRANT_CHECKS: Check[] = [
  {
    id: 'oneTarget',
    on: ['create'],
    severity: 'error',
    anchor: ['area_id', 'access_point_id'],
    texts: 'Choose an area or an access point: exactly one of them.',
    when: ({ values }) => present(values.area_id) === present(values.access_point_id),
  },
  {
    id: 'windowOrdered',
    on: ['create'],
    severity: 'error',
    anchor: 'valid_until',
    texts: 'Valid until must be after Valid from.',
    when: ({ values }) => {
      const from = instant(values.valid_from);
      const until = instant(values.valid_until);
      return from !== null && until !== null && until <= from;
    },
  },
];

/** Check again after a lost "Revoke": applied when the grant reads revoked now. */
export const grantRevoked: FlowUnknownCheck = async ({ record, data }) => {
  const id = record?.id;
  if (typeof id !== 'string' || id === '') return 'unknown';
  try {
    const { data: row } = await data.one(resourceByName(ACCESS_GRANT_RESOURCE) as never, { id } as never);
    if (row === null || row === undefined) return 'unknown';
    return present((row as Readonly<Record<string, unknown>>).revoked_at) ? 'applied' : 'not-applied';
  } catch {
    return 'unknown';
  }
};

const revokeFields = {
  reason: f.text({
    required: true,
    validate: checkNotBlank(),
    texts: {
      label: 'Reason',
      doc: { summary: 'Why the grant ends early: kept on the grant and recorded in the audit log.' },
    },
  }),
};

/**
 * "Revoke" on a grant that is not revoked and not used up (a used single-use grant opens nothing
 * any more): `revoke_access_grant` ends it now, with the reason. The only change a grant takes;
 * terminals are told at once (the policy epoch is bumped as urgent).
 */
export const revokeGrantFlow = {
  texts: {
    label: 'Revoke',
    notify: 'The grant is revoked: it opens no door from now on.',
    doc: {
      summary:
        'Ends the grant now, with a reason: it no longer opens any door, and terminals are told at once. A grant is never edited; revoke it and grant again instead.',
    },
  },
  icon: NAV_ICONS.revokeGrant,
  variant: 'destructive',
  surfaces: { default: 'menu', show: 'auto' },
  when: cond.all([
    cond.not(cond.present(ref('record', 'revoked_at'))),
    cond.not(cond.all([cond.equals(ref('record', 'single_use'), true), cond.present(ref('record', 'used_at'))])),
  ]),
  form: { fields: revokeFields },
  submit: {
    mutation: revokeAccessGrant,
    retry: 'never',
    input: { grantId: ref('record', 'id'), reason: ref('values', 'reason') },
    onUnknown: { check: grantRevoked },
  },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, typeof revokeFields>;
