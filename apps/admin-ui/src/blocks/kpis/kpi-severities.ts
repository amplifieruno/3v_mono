import type { StackPart } from '../charts/stacked-bar';
import type { DashboardKpis } from '../../modules/overview/kpis';

/** The severities, most urgent first, with the KPI column of each and its colours. */
const SEVERITY_PARTS = [
  { key: 'critical', column: 'open_incidents_critical', fill: 'fill-destructive', swatch: 'bg-destructive' },
  { key: 'high', column: 'open_incidents_high', fill: 'fill-warning', swatch: 'bg-warning' },
  { key: 'medium', column: 'open_incidents_medium', fill: 'fill-info', swatch: 'bg-info' },
  { key: 'low', column: 'open_incidents_low', fill: 'fill-neutral', swatch: 'bg-neutral' },
  { key: 'info', column: 'open_incidents_info', fill: 'fill-muted-foreground/40', swatch: 'bg-muted-foreground/40' },
] as const satisfies readonly { key: string; column: keyof DashboardKpis; fill: string; swatch: string }[];

/** The open incidents per severity as the parts of one bar, each named by `labelOf(severity)`. */
export function severityParts(kpis: DashboardKpis, labelOf: (severity: string) => string): StackPart[] {
  return SEVERITY_PARTS.map((part) => ({
    key: part.key,
    label: labelOf(part.key),
    value: kpis[part.column],
    fill: part.fill,
    swatch: part.swatch,
  }));
}
