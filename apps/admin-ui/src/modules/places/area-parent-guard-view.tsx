import { type BlockViewProps, useOne } from '@burojs/react';
import { CircleAlert } from 'lucide-react';
import type * as React from 'react';
import { AREA_RESOURCE } from './area';
import type { areaParentGuardBlock } from './area-parent-guard-block';
import { isInsideArea } from './area-tree';

/** The cycle notice of the area form (`itap:area-parent-guard`); empty while the parent is fine. */
export function AreaParentGuardView({
  props,
  t,
}: BlockViewProps<typeof areaParentGuardBlock>): React.ReactElement | null {
  const areaId = props.areaId ?? null;
  const parentId = props.parentId ?? null;
  const watched = areaId !== null && parentId !== null && parentId !== areaId;
  const parent = useOne(AREA_RESOURCE, { id: parentId ?? '', enabled: watched });
  if (areaId === null || parentId === null) return null;
  const row = (watched ? parent.data?.data : undefined) as Readonly<Record<string, unknown>> | undefined;
  const message =
    parentId === areaId
      ? t('self')
      : row !== undefined && isInsideArea(row.path, areaId)
        ? t('descendant', { params: { parent: String(row.name ?? '') } })
        : null;
  if (message === null) return null;
  return (
    <p
      role="alert"
      data-testid="area-parent-guard"
      className="flex items-start gap-2 text-sm text-destructive"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      {message}
    </p>
  );
}
