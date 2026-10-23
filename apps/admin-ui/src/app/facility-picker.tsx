import { useCtx, useDataRuntime, useIdentity, useList, useT } from '@burojs/react';
import { ContextPicker } from '@burojs/ui-shadcn';
import * as React from 'react';
import type { ItapIdentity } from '../auth';
import { facility } from '../modules/places/facility';
import { useConsole } from './console-context';
import { type ItapScope, applyFacility } from './scope';

/** `<ContextPicker>` cannot carry `null`: this stands for "all facilities" in the dropdown only. */
const ALL_FACILITIES = '__all__';

/** More facilities than one organization runs; the picker reads one page. */
export const FACILITY_PAGE_SIZE = 200;

interface FacilityRow {
  readonly id: string;
  readonly name: string;
}

function FacilitySelect({ organizationId }: { organizationId: string }): React.ReactElement {
  const t = useT();
  const { resolver } = useConsole();
  const { dataSession } = useDataRuntime();
  const scope = useCtx((ctx: { scope: ItapScope }) => ctx.scope);
  // The facility list itself is never narrowed by the facility selection.
  const facilities = useList(facility, {
    scope: 'none',
    pagination: { kind: 'offset', page: 1, pageSize: FACILITY_PAGE_SIZE },
    sort: [{ field: 'name', direction: 'asc' }],
  });
  const rows = (facilities.data?.data ?? []) as readonly FacilityRow[];
  const selected = scope.organization === organizationId ? scope.facility : null;
  // A remembered facility that is gone (deleted, or never this organization's) falls back to all.
  const stale = facilities.isSuccess && selected !== null && !rows.some((row) => row.id === selected);

  React.useEffect(() => {
    if (stale) void applyFacility({ dataSession, resolver }, organizationId, null);
  }, [stale, dataSession, resolver, organizationId]);

  const options = [
    { value: ALL_FACILITIES, label: t('console.allFacilities') },
    ...rows.map((row) => ({ value: row.id, label: row.name })),
  ];

  return (
    <ContextPicker
      sliceName="facility"
      label={t('console.facility')}
      options={options}
      value={selected ?? ALL_FACILITIES}
      disabled={facilities.isPending}
      onChange={(value) => {
        const next = value === ALL_FACILITIES ? null : value;
        if (next === selected) return;
        void applyFacility({ dataSession, resolver }, organizationId, next);
      }}
    />
  );
}

/**
 * The sidebar filters: the facility that narrows facility-bound lists, "All
 * facilities" by default. Hidden while the sidebar is collapsed to icons and
 * when no organization is open.
 */
export function FacilityPicker(): React.ReactElement | null {
  const { data: identity } = useIdentity<ItapIdentity>();
  if (!identity?.organizationId) return null;
  return (
    <div className="flex flex-col gap-2 px-2 pb-1 group-data-[collapsible=icon]:hidden" data-testid="facility-filter">
      <FacilitySelect key={identity.organizationId} organizationId={identity.organizationId} />
    </div>
  );
}
