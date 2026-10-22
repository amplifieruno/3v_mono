import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';

/** How the heatmap's rows are cut: one per area, or one per day of the week (the whole facility). */
export const HEATMAP_ROWS = ['area', 'weekday'] as const;

/**
 * Where the hours come from: `stats` reads `area_hourly_stats` (by area or by weekday), `series`
 * reads the facility's hourly `occupancy_series` (by weekday only: the series has no areas).
 */
export const HEATMAP_SOURCES = ['stats', 'series'] as const;

/** The most heatmap rows by area. */
export const HEATMAP_MAX_AREAS = 30;

/** The longest period a heatmap averages over, in days (a month of hours stays within one read). */
export const HEATMAP_MAX_DAYS = 31;

/**
 * When a facility is busy (`itap:heatmap`, `area_hourly_stats` or `occupancy_series`): the average number of people
 * present in each hour of the facility's day, per area (prop `by: 'area'`, the busiest `limit`
 * areas) or per day of the week for the whole facility (`by: 'weekday'`), as shaded cells. Props
 * `facilityId`, `days` (the last so many facility days, today included, at most 31), `by`, `limit`
 * and `source`. Hours
 * are the facility's clock hours.
 */
export const heatmapBlock = defineBlock('itap:heatmap', {
  texts: {
    label: 'Busy hours',
    chooseFacility: 'Choose a facility in the sidebar to see its busy hours.',
    loading: 'Reading the hourly figures…',
    failed: 'The hourly figures could not be read.',
    missing: 'This facility cannot be read.',
    none: 'Nobody was recorded in this facility over the period.',
    byArea: 'Average people present per hour of the day, by area',
    byWeekday: 'Average people present per hour of the day, by day of the week',
    cell: '{{row}}, {{hour}}: {{value}} people on average',
    noFigure: '{{row}}, {{hour}}: no such day in the period',
    note: 'Darker is busier. Hours in the facility’s time zone ({{zone}}); each figure is the people present in that hour averaged over the period’s days.',
    unknownArea: 'Removed area',
    truncated: 'Too many hourly figures for one read: the oldest hours of the period are left out, so the averages lean on recent days. Choose a shorter period.',
    summary: 'busiest {{row}} at {{hour}}, {{value}} people on average',
    areaHeader: 'Area',
    weekdayHeader: 'Day of the week',
  },
  props: {
    facilityId: prop(z.string().nullable().optional()).default(null),
    days: prop(z.number().int().min(1).max(HEATMAP_MAX_DAYS)).default(7),
    by: prop(z.enum(HEATMAP_ROWS)).default('area'),
    limit: prop(z.number().int().min(1).max(HEATMAP_MAX_AREAS)).default(12),
    source: prop(z.enum(HEATMAP_SOURCES)).default('stats'),
  },
});
