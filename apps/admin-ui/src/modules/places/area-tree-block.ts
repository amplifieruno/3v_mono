import { defineBlock, prop, ref, source } from '@burojs/core';
import { z } from 'zod';
import { area } from './area';

/** The most areas the tree reads at once (`source.list` allows 100); the count says when more exist. */
export const AREA_TREE_LIMIT = 100;

/**
 * A facility's areas as an indented, collapsible tree (`itap:area-tree`), on the facility
 * page's Areas tab: each area with its type, occupancy against capacity and a link to its
 * page, plus links to add an area. One `source.list` read of the facility's areas in path
 * order (parents before their sub-areas); a record screen reads it unnarrowed by the
 * sidebar facility picker, so the tab always shows this facility's own tree.
 */
export const areaTreeBlock = defineBlock('itap:area-tree', {
  texts: {
    label: 'Area tree',
    empty: 'This facility has no areas yet.',
    add: 'Add area',
    addInside: 'Add an area inside {{name}}',
    expand: 'Show the areas inside {{name}}',
    collapse: 'Hide the areas inside {{name}}',
    expandAll: 'Expand all',
    collapseAll: 'Collapse all',
    occupancy: '{{occupancy}} / {{capacity}}',
    occupancyOnly: '{{occupancy}} inside',
    overCapacity: 'Over capacity',
    truncated: 'Showing the first {{shown}} of {{total}} areas; open the Areas list for the rest.',
  },
  props: {
    facilityId: prop(z.string()).default(ref('record', 'id')),
  },
  data: {
    areas: ({ props }) =>
      source.list(() => area, {
        where: [{ field: 'facility_id', op: 'eq', value: props.facilityId }],
        sort: [{ field: 'path', direction: 'asc' }],
        limit: AREA_TREE_LIMIT,
        count: true,
      }),
  },
});
