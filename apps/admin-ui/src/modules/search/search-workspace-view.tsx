import { useIdentity } from '@burojs/react';
import { RecordScreen } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { currentRecordFrame } from '../../app/current-record-frame';
import type { ItapIdentity } from '../../auth';
import { SEARCH_WORKSPACE_RESOURCE } from '../../data/resource-names';

/**
 * The search workspace of the current organization in show mode: the search form in place. Keyed
 * by the organization id so a switch remounts the screen (and drops the form).
 */
export function SearchWorkspaceView(): React.ReactElement | null {
  const { data: identity } = useIdentity<ItapIdentity>();
  const organizationId = identity?.organizationId;
  if (!organizationId) return null;
  return (
    <RecordScreen
      key={organizationId}
      resource={SEARCH_WORKSPACE_RESOURCE}
      frame={currentRecordFrame}
      mode="show"
      recordId={organizationId}
    />
  );
}
