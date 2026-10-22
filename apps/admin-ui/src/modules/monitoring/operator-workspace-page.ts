import { defineCustomPage, facts, relatedList, source } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { liveWallBlock } from '../../blocks/live-camera/live-wall-block';
import { occupancyNowBlock } from '../../blocks/occupancy-now/occupancy-now-block';
import { severitiesFrom } from '../../enums/events';
import { WORKSPACE_PANELS, WORKSPACE_PANEL_LABELS, type WorkspacePanel } from '../../fields/workspace-panels-format';
import { event } from './event';
import { INCIDENT_COLUMNS, incident } from './incident';
import { ACTIVE_STATUSES } from './incident-flows';
import { operatorWorkspace } from './operator-workspace';
import { OCCUPANCY_FACT_ROWS, WORKSPACE_SLOTS, operatorWorkspaceLayout, workspaceOccupancyFacts } from './operator-workspace-query';

/** How many rows the incident and event panels show before paging. */
const PANEL_ROWS = 10;

/**
 * "Operator workspace" at the top of Monitoring: what an operator on shift keeps open, for the
 * facility chosen in the sidebar. Four panels, live cameras (the live wall of the cameras running
 * recognition, with their detections), open incidents, the latest critical events and the
 * facility's occupancy, shown in the order the operator's default workspace lays out
 * (`operator_workspaces.layout`; every panel in this order without one). Each slot of the page
 * shows the panel its workspace names there; "My workspaces" below arranges them.
 */
export const operatorWorkspacePage = defineCustomPage({
  name: 'operator-workspace',
  icon: NAV_ICONS.operatorWorkspace,
  path: '/workspace',
  texts: 'Operator workspace',
  section: NAV_SECTIONS.monitoring,
  order: 1,
  with: { workspace: source.query(operatorWorkspaceLayout, {}) },
  body: (l) => {
    const facility = l.ref('scope', 'facility');
    const content = (panel: WorkspacePanel, key: string) => {
      switch (panel) {
        case 'cameras':
          return [l.place(liveWallBlock, { key: `${key}-wall` })];
        case 'incidents':
          return [
            l.place(relatedList(incident), {
              key: `${key}-list`,
              props: {
                where: [{ field: 'status', op: 'in', value: [...ACTIVE_STATUSES] }],
                columns: [...INCIDENT_COLUMNS],
                pageSize: PANEL_ROWS,
                open: 'page',
              },
            }),
          ];
        case 'events':
          return [
            l.place(relatedList(event), {
              key: `${key}-list`,
              props: {
                where: [{ field: 'severity', op: 'in', value: severitiesFrom('critical') }],
                columns: ['occurred_at', 'severity', 'event_type', 'title', 'area_id'],
                pageSize: PANEL_ROWS,
                open: 'page',
              },
            }),
          ];
        case 'occupancy':
          return [
            l.place(facts, {
              key: `${key}-facts`,
              props: { query: workspaceOccupancyFacts, input: { facilityId: facility }, rows: [...OCCUPANCY_FACT_ROWS], view: 'grid' },
              when: l.present(facility),
            }),
            // Without a facility the occupancy block reads nothing and asks for one.
            l.place(occupancyNowBlock, { key: `${key}-choose`, props: { facilityId: null }, when: l.not(l.present(facility)) }),
          ];
      }
    };
    const slots = WORKSPACE_SLOTS.flatMap((slot) =>
      WORKSPACE_PANELS.map((panel) =>
        l.panel(content(panel, `${slot}-${panel}`), {
          key: `${slot}-${panel}`,
          texts: { title: WORKSPACE_PANEL_LABELS[panel] },
          when: l.equals(l.ref('workspace', slot), panel),
        }),
      ),
    );
    return [
      ...slots,
      l.panel(
        [
          l.place(relatedList(operatorWorkspace), {
            key: 'my-workspaces',
            props: { columns: ['name', 'is_default', 'layout'], open: 'page' },
          }),
        ],
        {
          key: 'arrange',
          texts: {
            title: 'Arrange this page',
            description:
              'Your workspaces: the default one decides which panels this page shows and in which order. Create one to arrange the page for yourself.',
          },
        },
      ),
    ];
  },
});
