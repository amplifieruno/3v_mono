import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';
import { MAX_PERIOD_DAYS } from '../charts/period';

/** The most areas the matrix shows (rows and columns each). */
export const FLOW_MAX_AREAS = 20;

/**
 * How people moved between the areas of a facility over a period (`itap:flow-matrix`,
 * `flow_matrix`): a matrix of moves from the area of each row to the area of each column, the
 * busiest areas only (prop `limit`), and the most frequent moves listed. Props `facilityId`,
 * `days` (the last so many facility days, today included) and `limit`.
 */
export const flowMatrixBlock = defineBlock('itap:flow-matrix', {
  texts: {
    label: 'Movement between areas',
    chooseFacility: 'Choose a facility in the sidebar to see how people move between its areas.',
    loading: 'Reading the movements…',
    failed: 'The movements could not be read.',
    missing: 'This facility cannot be read.',
    none: 'No movement between areas was recorded over the period.',
    matrix: 'Moves from the area of each row to the area of each column',
    axes: 'Rows: from · columns: to. {{total}} moves over the period.',
    others: '{{count}} moves between other areas are not shown.',
    cell: '{{from}} → {{to}}: {{count}} moves',
    top: 'Most frequent moves',
    move: '{{from}} → {{to}}',
    unknownArea: 'Removed area',
  },
  props: {
    facilityId: prop(z.string().nullable().optional()).default(null),
    days: prop(z.number().int().min(1).max(MAX_PERIOD_DAYS)).default(7),
    limit: prop(z.number().int().min(2).max(FLOW_MAX_AREAS)).default(8),
  },
});
