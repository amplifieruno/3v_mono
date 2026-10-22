import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { AREA_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { ANALYTICS_BINDING } from '../facility-period/analytics-binding';
import { areaName, flowRead, flowRow } from './flow-matrix-shape';

/** The most areas read to name the matrix (a facility has far fewer). */
export const FLOW_AREA_LIMIT = 1000;

const flowInput = z.object({ facilityId: z.string().uuid(), from: z.string(), to: z.string() });

/**
 * `flow_matrix(hasura_session, p_facility, p_from, p_to)`: the moves between two areas of the
 * facility summed over the facility days overlapping the period (`area_transitions_daily`), most
 * frequent first, with the facility's area names in the same read.
 */
export const flowMatrixOperation = hasuraOperation(ANALYTICS_BINDING, 'flowMatrix', {
  kind: 'query',
  document: `query FlowMatrix($facility: uuid!, $from: timestamptz!, $to: timestamptz!) {
  flow_matrix(args: { p_facility: $facility, p_from: $from, p_to: $to }) {
    from_area_id
    to_area_id
    count
  }
  areas(where: { facility_id: { _eq: $facility } }, limit: ${FLOW_AREA_LIMIT}) {
    id
    name
  }
}`,
  variables: (input) => {
    const { facilityId, from, to } = input as z.infer<typeof flowInput>;
    return { facility: facilityId, from, to };
  },
  mapResult: (data) => {
    const rows = z.array(flowRow).safeParse(rootOf(data, 'flow_matrix'));
    const areas = z.array(areaName).safeParse(rootOf(data, 'areas'));
    return rows.success && areas.success ? { rows: rows.data, areas: areas.data } : null;
  },
});

/** A facility's moves between areas over a period (`itap:flow-matrix`). */
export const flowMatrix = defineQuery('itap:flow-matrix-rows', {
  binding: flowMatrixOperation.binding,
  input: schema(flowInput),
  output: schema(flowRead.nullable()),
  reads: [resourceByName(AREA_RESOURCE)],
});
