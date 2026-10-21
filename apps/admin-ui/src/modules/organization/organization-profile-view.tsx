import { useIdentity } from '@burojs/react';
import { RecordScreen } from '@burojs/ui-shadcn';
import type * as React from 'react';
import type { ItapIdentity } from '../../auth';
import { ORGANIZATION_RESOURCE } from './organization';

/**
 * The current organization in show mode; Edit opens the resource's own edit
 * screen. Keyed by the organization id so a switch remounts the screen.
 */
export function OrganizationProfileView(): React.ReactElement | null {
  const { data: identity } = useIdentity<ItapIdentity>();
  const organizationId = identity?.organizationId;
  if (!organizationId) return null;
  return (
    <RecordScreen key={organizationId} resource={ORGANIZATION_RESOURCE} mode="show" recordId={organizationId} />
  );
}
