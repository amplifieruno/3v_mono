import { useIdentity } from '@burojs/react';
import { RecordScreen } from '@burojs/ui-shadcn';
import type * as React from 'react';
import type { ItapIdentity } from '../../auth';
import { SETTINGS_RESOURCE } from './settings';

/**
 * The current organization's settings in show mode; Edit opens the resource's
 * own edit screen. Keyed by the organization id so a switch remounts the screen.
 */
export function OrganizationSettingsView(): React.ReactElement | null {
  const { data: identity } = useIdentity<ItapIdentity>();
  const organizationId = identity?.organizationId;
  if (!organizationId) return null;
  return (
    <RecordScreen
      key={organizationId}
      resource={SETTINGS_RESOURCE}
      mode="show"
      recordId={organizationId}
    />
  );
}
