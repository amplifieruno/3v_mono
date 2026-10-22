import { defineQuery } from '@burojs/core';
import { f } from '@burojs/field-types';
import { z } from 'zod';
import { MONITORING_BINDING, type OccupancyRow, occupancyRow } from '../../blocks/occupancy-now/occupancy-query';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { AREA_OCCUPANCY_RESOURCE, OPERATOR_WORKSPACE_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { workspacePanels } from '../../fields/workspace-panels-format';

/** The workspace page's slots, top to bottom (one per panel): each shows the panel named in it, or nothing. */
export const WORKSPACE_SLOTS = ['slot1', 'slot2', 'slot3', 'slot4'] as const;

export const workspaceLayout = z.object({
  workspace_id: z.string().nullable(),
  workspace_name: z.string().nullable(),
  slot1: z.string(),
  slot2: z.string(),
  slot3: z.string(),
  slot4: z.string(),
});

export type WorkspaceLayout = z.infer<typeof workspaceLayout>;

/** The slots of a workspace row (or of none: the default layout); an unused slot is `''`. */
export function layoutOf(row: unknown): WorkspaceLayout {
  const value = (row ?? null) as { readonly id?: unknown; readonly name?: unknown; readonly layout?: unknown } | null;
  const panels = workspacePanels(value?.layout);
  const slot = (index: number) => panels[index] ?? '';
  return {
    workspace_id: typeof value?.id === 'string' ? value.id : null,
    workspace_name: typeof value?.name === 'string' ? value.name : null,
    slot1: slot(0),
    slot2: slot(1),
    slot3: slot(2),
    slot4: slot(3),
  };
}

/**
 * The signed-in operator's workspace: their default one, else their first (the role reads only the
 * session user's rows), else none, which lays the page out with every panel in the default order.
 */
export const workspaceLayoutOperation = hasuraOperation(MONITORING_BINDING, 'operatorWorkspaceLayout', {
  kind: 'query',
  document: `query OperatorWorkspaceLayout {
  operator_workspaces(order_by: [{ is_default: desc }, { created_at: asc }], limit: 1) { id name layout }
}`,
  variables: () => undefined,
  mapResult: (data) => {
    const rows = rootOf(data, 'operator_workspaces');
    return layoutOf(Array.isArray(rows) ? rows[0] : null);
  },
});

const slotField = (index: number) =>
  f.string({ texts: { label: `Slot ${index}`, doc: { summary: `The panel shown in place ${index} of the workspace page.` } } });

/** The operator's workspace layout as slots (`itap:operator-workspace-layout`); refreshed when a workspace changes. */
export const operatorWorkspaceLayout = defineQuery('itap:operator-workspace-layout', {
  binding: workspaceLayoutOperation.binding,
  input: schema(z.object({})),
  output: schema(workspaceLayout),
  reads: [resourceByName(OPERATOR_WORKSPACE_RESOURCE)],
  fields: {
    workspace_id: f.string({ texts: { label: 'Workspace', doc: { summary: 'The workspace laying the page out; empty for the default layout.' } } }),
    workspace_name: f.string({ texts: { label: 'Workspace name', doc: { summary: 'The name of that workspace.' } } }),
    slot1: slotField(1),
    slot2: slotField(2),
    slot3: slotField(3),
    slot4: slotField(4),
  },
});

export const occupancyFacts = z.object({
  on_site: z.number(),
  capacity: z.number().nullable(),
  areas_over_capacity: z.number(),
  busiest_area: z.string().nullable(),
});

/** The facility's figures from its occupancy rows (`facility_occupancy_now`). */
export function occupancyFactsOf(rows: readonly OccupancyRow[]): z.infer<typeof occupancyFacts> {
  const facility = rows.find((row) => row.area_id === null);
  const areas = rows.filter((row) => row.area_id !== null);
  const busiest = areas.reduce<OccupancyRow | null>((best, row) => (row.occupancy > (best?.occupancy ?? 0) ? row : best), null);
  return {
    on_site: facility?.occupancy ?? 0,
    capacity: facility?.capacity ?? null,
    areas_over_capacity: areas.filter((row) => row.capacity !== null && row.occupancy > row.capacity).length,
    busiest_area: busiest === null ? null : `${busiest.name} (${busiest.occupancy})`,
  };
}

/** `facility_occupancy_now(hasura_session, p_facility)` summed up for the workspace's occupancy panel. */
export const occupancyFactsOperation = hasuraOperation(MONITORING_BINDING, 'workspaceOccupancyFacts', {
  kind: 'query',
  document: `query WorkspaceOccupancyFacts($facility: uuid!) {
  facility_occupancy_now(args: { p_facility: $facility }) {
    area_id
    parent_id
    name
    capacity
    occupancy
    direct_occupancy
  }
}`,
  variables: (input) => ({ facility: (input as { facilityId: string }).facilityId }),
  mapResult: (data) => {
    const rows = z.array(occupancyRow).safeParse(rootOf(data, 'facility_occupancy_now'));
    return occupancyFactsOf(rows.success ? rows.data : []);
  },
});

/** The facility's occupancy in four figures (`itap:workspace-occupancy-facts`). */
export const workspaceOccupancyFacts = defineQuery('itap:workspace-occupancy-facts', {
  binding: occupancyFactsOperation.binding,
  input: schema(z.object({ facilityId: z.string().uuid() })),
  output: schema(occupancyFacts),
  reads: [resourceByName(AREA_OCCUPANCY_RESOURCE)],
  fields: {
    on_site: f.number({ texts: { label: 'On site now', doc: { summary: 'Everyone in the facility now, each person once.' } } }),
    capacity: f.number({ texts: { label: 'Capacity', doc: { summary: 'How many people the facility is meant to hold; empty when not set.' } } }),
    areas_over_capacity: f.number({
      texts: { label: 'Areas over capacity', doc: { summary: 'Areas holding more people than their capacity now.' } },
    }),
    busiest_area: f.string({
      texts: { label: 'Busiest area', doc: { summary: 'The area with the most people now (sub-areas included), with its count.' } },
    }),
  },
});

/** The figures of the occupancy panel, in order. */
export const OCCUPANCY_FACT_ROWS = ['on_site', 'capacity', 'areas_over_capacity', 'busiest_area'] as const;

/** The workspace queries, for the module's registry. */
export const WORKSPACE_OPERATIONS = [workspaceLayoutOperation, occupancyFactsOperation];
