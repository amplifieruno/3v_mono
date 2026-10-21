import { defineCustomPage, facts } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { DASHBOARD_KPI_ROWS, dashboardKpis } from './kpis';

/**
 * The landing page: the organization's headline figures, the facts of
 * `dashboardKpis` labelled by the query's own fields.
 */
export const dashboardPage = defineCustomPage({
  name: 'dashboard',
  icon: NAV_ICONS.dashboard,
  path: '/dashboard',
  texts: 'Dashboard',
  section: NAV_SECTIONS.overview,
  order: 0,
  body: (l) => [
    l.place(facts, {
      key: 'kpis',
      props: { query: dashboardKpis, rows: [...DASHBOARD_KPI_ROWS], view: 'grid' },
    }),
  ],
});
