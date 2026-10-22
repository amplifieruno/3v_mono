import { type BlockViewProps, useList, useOne } from '@burojs/react';
import { TriangleAlert } from 'lucide-react';
import type * as React from 'react';
import { countTemplateNodes, templateNodesOf } from '../../fields/template-structure-format';
import { TemplateTree } from '../../fields/template-tree';
import { type SiblingArea, overlappingNames } from './template-overlap';
import type { templateOverlapBlock } from './template-overlap-block';
import { AREA_RESOURCE, FACILITY_TEMPLATE_RESOURCE } from '../../data/resource-names';

/** More areas than one facility holds; one page is read. */
const AREAS_PAGE_SIZE = 500;

const siblingOf = (row: unknown): SiblingArea[] => {
  const r = row as Readonly<Record<string, unknown>> | null;
  if (r === null || typeof r !== 'object' || typeof r.name !== 'string') return [];
  return [{ name: r.name, parent_id: typeof r.parent_id === 'string' ? r.parent_id : null }];
};

/** The template preview and overlap warning of the "Apply template" form (`itap:template-overlap`). */
export function TemplateOverlapView({
  props,
  t,
}: BlockViewProps<typeof templateOverlapBlock>): React.ReactElement {
  const facilityId = props.facilityId ?? null;
  const templateId = props.templateId ?? null;
  const parentId = props.parentId ?? null;
  const template = useOne(FACILITY_TEMPLATE_RESOURCE, {
    id: templateId ?? '',
    enabled: templateId !== null,
  });
  const areas = useList(AREA_RESOURCE, {
    scope: 'none',
    filter: { field: 'facility_id', op: 'eq', value: facilityId ?? '' },
    pagination: { kind: 'offset', page: 1, pageSize: AREAS_PAGE_SIZE },
    enabled: facilityId !== null && templateId !== null,
  });
  if (templateId === null) return <p className="text-sm text-muted-foreground">{t('pick')}</p>;
  const row = template.data?.data as Readonly<Record<string, unknown>> | undefined;
  if (row === undefined) return <p className="text-sm text-muted-foreground">{t('loading')}</p>;
  const nodes = templateNodesOf(row.structure);
  const overlap = overlappingNames(nodes, (areas.data?.data ?? []).flatMap(siblingOf), parentId);
  return (
    <div className="flex flex-col gap-2" data-testid="template-overlap">
      <p className="text-sm font-medium">
        {t('creates', { params: { count: countTemplateNodes(nodes) } })}
      </p>
      <TemplateTree nodes={nodes} label={t('label')} />
      {overlap.length === 0 ? null : (
        <p
          role="alert"
          data-testid="template-overlap-warning"
          className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t('overlap', { params: { names: overlap.join(', ') } })}
        </p>
      )}
    </div>
  );
}
