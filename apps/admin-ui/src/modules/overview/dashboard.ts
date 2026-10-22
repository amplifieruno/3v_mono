import { defineCustomPage, facts, source } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { dashboardGridBlock } from '../../blocks/dashboard-grid/dashboard-grid-block';
import { DASHBOARD_KPI_ROWS, dashboardKpis } from './kpis';
import { landingDashboard } from './landing-dashboard';

/**
 * The landing page: your own dashboard marked "On my Dashboard page" when you have one (its widgets
 * for the sidebar facility), then the organization's headline figures, the facts of
 * `dashboardKpis` labelled by the query's own fields.
 */
export const dashboardPage = defineCustomPage({
  name: 'dashboard',
  icon: NAV_ICONS.dashboard,
  path: '/dashboard',
  texts: 'Dashboard',
  section: NAV_SECTIONS.overview,
  order: 0,
  with: { landing: source.query(landingDashboard, {}) },
  body: (l) => [
    l.panel(
      [
        l.place(dashboardGridBlock, {
          key: 'landing-dashboard',
          props: { widgets: l.ref('landing', 'widgets'), facilityId: l.ref('scope', 'facility') },
        }),
      ],
      {
        key: 'landing',
        texts: {
          title: 'My dashboard',
          description: 'Your dashboard marked “On my Dashboard page”. Change it under Analytics › Dashboards.',
        },
        when: l.present(l.ref('landing', 'id')),
      },
    ),
    l.place(facts, {
      key: 'kpis',
      props: { query: dashboardKpis, rows: [...DASHBOARD_KPI_ROWS], view: 'grid' },
    }),
  ],
});
