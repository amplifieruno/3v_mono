import { resourceShowHref } from '@burojs/core';
import { type BlockViewProps, useApp, useCustomQuery } from '@burojs/react';
import { EnumBadge, useLinkComponent } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { INCIDENT_RESOURCE } from '../../data/resource-names';
import { EVENT_SEVERITY_ENUM, INCIDENT_STATUS_ENUM } from '../../enums/events';
import { BlockNote } from '../charts/block-note';
import type { incidentsListBlock } from './incidents-list-block';
import { incidentsList } from './incidents-list-query';

const TEST_ID = 'incidents-list';

/** The incidents list block's view (`itap:incidents-list`): one line per incident, newest first, links to each. */
export function IncidentsListView({ props, t }: BlockViewProps<typeof incidentsListBlock>): React.ReactElement {
  const app = useApp();
  const Link = useLinkComponent();
  const incidents = useCustomQuery(incidentsList, {
    facilityId: props.facilityId ?? null,
    status: props.status,
    minSeverity: props.minSeverity,
    limit: props.limit,
  });
  if (incidents.isError || incidents.data === null) return <BlockNote testId={TEST_ID} tone="error">{t('failed')}</BlockNote>;
  if (incidents.data === undefined) return <BlockNote testId={TEST_ID}>{t('loading')}</BlockNote>;
  const { rows, total } = incidents.data;
  if (rows.length === 0) return <BlockNote testId={TEST_ID}>{t(props.status === 'open' ? 'noneOpen' : 'none')}</BlockNote>;
  const def = app.registry.get(INCIDENT_RESOURCE);
  return (
    <section data-testid={TEST_ID} className="flex flex-col gap-2" aria-label={t('label')}>
      <ul className="flex flex-col divide-y rounded-md border">
        {rows.map((row) => (
          <li key={row.id} data-testid={`${TEST_ID}-row`} className="flex flex-col gap-1 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <EnumBadge enumName={EVENT_SEVERITY_ENUM} value={row.severity} />
              <Link href={resourceShowHref(app.registry, def, INCIDENT_RESOURCE, row.id)} className="min-w-0 truncate font-medium hover:underline">
                {`${row.code} · ${row.title}`}
              </Link>
              <EnumBadge enumName={INCIDENT_STATUS_ENUM} value={row.status} className="ml-auto" />
            </div>
            <p className="text-xs text-muted-foreground">
              {[row.facility?.name ?? t('everywhere'), row.area?.name, t('raised', { params: { time: new Date(row.created_at).toLocaleString() } })]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </li>
        ))}
      </ul>
      {total > rows.length ? <p className="text-xs text-muted-foreground">{t('shown', { params: { shown: rows.length, total } })}</p> : null}
    </section>
  );
}
