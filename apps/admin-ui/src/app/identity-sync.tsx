import { useDataRuntime, useIdentity } from '@burojs/react';
import * as React from 'react';
import type { ItapIdentity } from '../auth';
import { useConsole } from './console-context';
import { type ItapScope, applyFacility, readStoredFacility } from './scope';

/**
 * Keeps the resolver in step with the signed-in identity: `user` and
 * `permissions` from it, and, when the organization changes (sign-in, switch),
 * the facility scope remembered for the new organization.
 */
export function IdentitySync(): null {
  const { data: identity, isPending } = useIdentity<ItapIdentity>();
  const { resolver } = useConsole();
  const { dataSession } = useDataRuntime();
  const organizationId = identity?.organizationId ?? null;

  React.useEffect(() => {
    // `undefined` while the identity loads: the slices stay pending instead of reading "signed out".
    resolver.feedAuth(isPending ? undefined : (identity ?? null));
  }, [resolver, identity, isPending]);

  React.useEffect(() => {
    if (organizationId === null) return;
    const current = resolver.snapshot().scope as ItapScope;
    if (current.organization === organizationId) return;
    void applyFacility({ dataSession, resolver }, organizationId, readStoredFacility(organizationId));
  }, [resolver, dataSession, organizationId]);

  return null;
}
