import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';

/** The headline figures the KPI block can show, in their default order. */
export const KPI_FIGURES = [
  'unique_visitors_today',
  'current_occupancy',
  'open_incidents',
  'open_incidents_critical',
  'devices_offline',
  'deliveries_failed_24h',
] as const;

export type KpiFigure = (typeof KPI_FIGURES)[number];

/** A choice of figures: at least one, each at most once, in the order shown. */
export const kpiFigures = z
  .array(z.enum(KPI_FIGURES))
  .min(1)
  .max(KPI_FIGURES.length)
  .refine((figures) => new Set(figures).size === figures.length, { message: 'Each figure can be shown once.' });

/**
 * The organization's headline figures (`itap:kpis`, `dashboard_kpis`): one tile per figure (prop
 * `figures`, in order), the open incidents by severity as one bar, and the segments whose member
 * count changed most since yesterday (prop `details`). Organization-wide: no facility.
 */
export const kpisBlock = defineBlock('itap:kpis', {
  texts: {
    label: 'Key figures',
    loading: 'Reading the figures…',
    failed: 'The figures could not be read.',
    none: 'No figures: the session names no organization.',
    unique_visitors_today: 'Visitors today',
    current_occupancy: 'On site now',
    open_incidents: 'Open incidents',
    open_incidents_critical: 'Critical incidents',
    devices_offline: 'Devices offline',
    deliveries_failed_24h: 'Failed notifications, 24 h',
    severities: 'Open incidents by severity',
    severityChart: 'Open incidents by severity, most urgent first',
    noIncidents: 'No open incident.',
    movers: 'Segments that changed most since yesterday',
    noMovers: 'No segment changed since yesterday.',
    moverCounts: '{{previous}} → {{current}}',
    asOf: 'As of {{time}}; “today” is {{day}} in the organization’s calendar.',
  },
  props: {
    figures: prop(kpiFigures).default([...KPI_FIGURES]),
    details: prop(z.boolean()).default(true),
  },
});
