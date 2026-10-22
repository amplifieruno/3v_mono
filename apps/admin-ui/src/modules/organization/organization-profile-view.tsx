import { useIdentity } from '@burojs/react';
import { RecordScreen } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { currentRecordFrame } from '../../app/current-record-frame';
import type { ItapIdentity } from '../../auth';
import { ORGANIZATION_RESOURCE } from './organization';

/**
 * The current organization in show mode, in the current-record frame (the page
 * heading names it); Edit opens the resource's own edit screen. Keyed by the
 * organization id so a switch remounts the screen.
 */
export function OrganizationProfileView(): React.ReactElement | null {
  const { data: identity } = useIdentity<ItapIdentity>();
  const organizationId = identity?.organizationId;
  if (!organizationId) return null;
  return (
    <RecordScreen
      key={organizationId}
      resource={ORGANIZATION_RESOURCE}
      frame={currentRecordFrame}
      mode="show"
      recordId={organizationId}
    />
  );
}
