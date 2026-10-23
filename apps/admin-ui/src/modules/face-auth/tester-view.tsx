import { useIdentity } from '@burojs/react';
import { RecordScreen } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { currentRecordFrame } from '../../app/current-record-frame';
import type { ItapIdentity } from '../../auth';
import { AUTH_TESTER_RESOURCE } from '../../data/resource-names';

/**
 * The tester of the current organization in show mode: the "Authenticate" form in place. Keyed
 * by the organization id so a switch remounts the screen (and drops the form and its frames).
 */
export function AuthTesterView(): React.ReactElement | null {
  const { data: identity } = useIdentity<ItapIdentity>();
  const organizationId = identity?.organizationId;
  if (!organizationId) return null;
  return (
    <RecordScreen key={organizationId} resource={AUTH_TESTER_RESOURCE} frame={currentRecordFrame} mode="show" recordId={organizationId} />
  );
}
