import { createReadyPermissions, defineContextSlices } from '@burojs/context';
import type { PermissionMap } from '@burojs/core';
import type { ItapIdentity } from '../auth';
import type { ItapScope } from './scope';

/** The organization administrator: today the console's only role. */
export const ORG_ADMIN_ROLE = 'org_admin';

/**
 * Which `action:subject` pairs each role holds. `org_admin` holds every pair;
 * the future roles get their rows here, so a new role is a visible decision.
 */
const GRANTS: Readonly<Record<string, (action: string, subject: string) => boolean>> = {
  [ORG_ADMIN_ROLE]: () => true,
};

/** The permission map of one identity: the union of its roles' grants. */
export function permissionsFor(identity: Pick<ItapIdentity, 'roles'>): PermissionMap {
  const grants = identity.roles.flatMap((role) => (Object.hasOwn(GRANTS, role) ? [GRANTS[role]] : []));
  return createReadyPermissions({
    can: (action, subject) => grants.some((grant) => grant?.(action, subject) === true),
  });
}

export const NO_SCOPE: ItapScope = { organization: null, facility: null };

/**
 * The resolver's slices: `user` and `permissions` follow the signed-in
 * identity (`IdentitySync` feeds it); `scope` is set by `applyFacility`.
 */
export function itapContextSlices() {
  return defineContextSlices((s) => ({
    user: s.fromAuth({
      extract: (identity: ItapIdentity | null) =>
        identity ? { id: identity.id, roles: [...identity.roles] } : undefined,
    }),
    permissions: s.fromAuth({
      extract: (identity: ItapIdentity | null) => (identity ? permissionsFor(identity) : undefined),
    }),
    scope: s.static<ItapScope>({ value: NO_SCOPE }),
  }));
}
