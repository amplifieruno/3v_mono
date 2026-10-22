import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { AREA_HOURLY_STAT_RESOURCE, AREA_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { ANALYTICS_BINDING } from '../facility-period/analytics-binding';
import { HEATMAP_ROWS } from './heatmap-block';
import { heatRead, hourRow } from './heatmap-shape';

/**
 * The most hourly rows one read takes. Rows exist only for hours with presence, read newest first:
 * a month of a busy facility stays under it; past it the oldest hours are cut and `truncated` says so.
 */
export const HEATMAP_ROW_LIMIT = 20_000;

const heatInput = z.object({
  facilityId: z.string().uuid(),
  from: z.string(),
  to: z.string(),
  by: z.enum(HEATMAP_ROWS),
});

/**
 * The hourly rows of `area_hourly_stats` for one facility in `[from, to)`: the area rows for a
 * heatmap by area, the facility total rows (no area) for one by weekday; presence seconds only,
 * with the facility's area names in the same read.
 */
export const heatmapOperation = hasuraOperation(ANALYTICS_BINDING, 'heatmapHours', {
  kind: 'query',
  document: `query HeatmapHours($facility: uuid!, $from: timestamptz!, $to: timestamptz!, $total: Boolean!) {
  area_hourly_stats(
    where: { facility_id: { _eq: $facility }, hour: { _gte: $from, _lt: $to }, area_id: { _is_null: $total } }
    order_by: [{ hour: desc }]
    limit: ${HEATMAP_ROW_LIMIT}
  ) {
    area_id
    hour
    dwell_seconds
  }
  areas(where: { facility_id: { _eq: $facility } }, limit: 1000) {
    id
    name
  }
}`,
  variables: (input) => {
    const { facilityId, from, to, by } = input as z.infer<typeof heatInput>;
    return { facility: facilityId, from, to, total: by === 'weekday' };
  },
  mapResult: (data) => {
    const rows = z.array(hourRow).safeParse(rootOf(data, 'area_hourly_stats'));
    const areas = z.array(z.object({ id: z.string(), name: z.string() })).safeParse(rootOf(data, 'areas'));
    return rows.success && areas.success
      ? { rows: rows.data, areas: areas.data, truncated: rows.data.length >= HEATMAP_ROW_LIMIT }
      : null;
  },
});

/** A facility's hourly presence over a period (`itap:heatmap`). */
export const heatmapHours = defineQuery('itap:heatmap-hours', {
  binding: heatmapOperation.binding,
  input: schema(heatInput),
  output: schema(heatRead.nullable()),
  reads: [resourceByName(AREA_HOURLY_STAT_RESOURCE), resourceByName(AREA_RESOURCE)],
});
