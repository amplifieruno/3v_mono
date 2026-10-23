import { defineMutation } from '@burojs/core';
import { z } from 'zod';
import { type HasuraOperationEntry, hasuraOperation, rootOf } from '../../data/operations';
import { ACCESS_DECISION_RESOURCE, ACCESS_GRANT_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { type SqlRefusalText, sqlRefusals } from '../../data/sql-refusals';
import { ACCESS_BINDING } from './policy-ops';

const NOTHING = ' Nothing was changed.';

/** What `revoke_access_grant` raises (and the grant guard behind it). */
export const REVOKE_GRANT_REFUSALS: Readonly<Record<string, SqlRefusalText>> = {
  access_grant_not_found: 'The grant no longer exists: reload the list.' + NOTHING,
  access_grant_revoked: 'The grant was already revoked (by someone else meanwhile?): reload it.' + NOTHING,
  access_grant_not_editable: 'A grant never changes except by being revoked once.' + NOTHING,
};

/** What `check_access` raises (`itap.evaluate_access` behind it): no decision was recorded. */
export const CHECK_ACCESS_REFUSALS: Readonly<Record<string, SqlRefusalText>> = {
  member_required: 'Only an active member of the organization can test access (your membership is suspended or expired). No decision was recorded.',
  access_point_not_found: 'The access point no longer exists. No decision was recorded.',
  profile_not_found: 'The person no longer exists (or is not visible to you). No decision was recorded.',
  identity_not_found: 'The face (identity) no longer exists. No decision was recorded.',
  identity_profile_mismatch:
    'The face belongs to another person than the one chosen: choose only the person, or only the face. No decision was recorded.',
  device_not_found: 'The device no longer exists. No decision was recorded.',
  invalid_device: 'That device is not bound to this access point. No decision was recorded.',
};

export const revokeGrantInput = z.object({ grantId: z.string().uuid(), reason: z.string() });
export const checkAccessInput = z.object({
  accessPointId: z.string().uuid(),
  profileId: z.string().uuid().nullable(),
  identityId: z.string().uuid().nullable(),
});

/** A grant as `revoke_access_grant` returns it. */
export const revokedGrant = z.object({ id: z.string(), revoked_at: z.string().nullable() });
/** The decision `check_access` recorded. */
export const recordedDecision = z.object({ id: z.string(), result: z.string(), reason: z.string() });

function firstRow(field: string) {
  return (data: unknown) => {
    const rows = rootOf(data, field);
    return Array.isArray(rows) ? (rows[0] ?? null) : null;
  };
}

export const revokeAccessGrantOperation: HasuraOperationEntry = hasuraOperation(
  ACCESS_BINDING,
  'revokeAccessGrant',
  {
    kind: 'mutation',
    document: `mutation RevokeAccessGrant($grant: uuid!, $reason: String!) {
  revoke_access_grant(args: { p_grant: $grant, p_reason: $reason }) { id revoked_at }
}`,
    variables: (input) => {
      const { grantId, reason } = input as z.infer<typeof revokeGrantInput>;
      return { grant: grantId, reason };
    },
    mapResult: firstRow('revoke_access_grant'),
  },
  sqlRefusals(REVOKE_GRANT_REFUSALS),
);

export const checkAccessOperation: HasuraOperationEntry = hasuraOperation(
  ACCESS_BINDING,
  'checkAccess',
  {
    kind: 'mutation',
    document: `mutation CheckAccess($point: uuid!, $profile: uuid, $identity: uuid) {
  check_access(args: { access_point_id: $point, profile_id: $profile, identity_id: $identity }) { id result reason }
}`,
    variables: (input) => {
      const { accessPointId, profileId, identityId } = input as z.infer<typeof checkAccessInput>;
      return { point: accessPointId, profile: profileId, identity: identityId };
    },
    mapResult: firstRow('check_access'),
  },
  sqlRefusals(CHECK_ACCESS_REFUSALS),
);

/** Revokes a grant once, with the reason; it no longer opens any door from now on. */
export const revokeAccessGrant = defineMutation('itap:revoke-access-grant', {
  binding: revokeAccessGrantOperation.binding,
  input: schema(revokeGrantInput),
  output: schema(revokedGrant.nullable()),
  effects: [{ resource: ACCESS_GRANT_RESOURCE }],
});

/**
 * Asks the access engine now, as a terminal would, and records the decision (an event too; a
 * single-use grant that decides is consumed). Not a dry run: what-if questions are simulations.
 */
export const checkAccess = defineMutation('itap:check-access', {
  binding: checkAccessOperation.binding,
  input: schema(checkAccessInput),
  output: schema(recordedDecision.nullable()),
  effects: [{ resource: ACCESS_DECISION_RESOURCE }, { resource: ACCESS_GRANT_RESOURCE }],
});

/** The grant and decision operations, for the module's registry. */
export const GRANT_OPERATIONS = [revokeAccessGrantOperation, checkAccessOperation];

/** The grant and decision mutations, for the module's `uses`. */
export const GRANT_MUTATIONS = [revokeAccessGrant, checkAccess];
