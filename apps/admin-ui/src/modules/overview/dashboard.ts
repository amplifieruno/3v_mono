import { type PageLayout, facts } from '@burojs/core';
import { DASHBOARD_KPI_ROWS, dashboardKpis } from './kpis';

/**
 * The dashboard page body: the organization's headline figures, the facts of
 * `dashboardKpis` labelled by the query's own fields.
 */
export const dashboardBody = (l: PageLayout) => [
  l.place(facts, {
    key: 'kpis',
    props: { query: dashboardKpis, rows: [...DASHBOARD_KPI_ROWS], view: 'grid' },
  }),
];
