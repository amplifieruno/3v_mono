import type { ConsoleModule } from '../module';
import { dashboardPage } from './dashboard';
import { dashboardKpis, dashboardKpisOperation } from './kpis';
import { landingDashboard, landingDashboardOperation } from './landing-dashboard';

/** Overview: the landing page, its `dashboard_kpis` figures and the member's landing dashboard. */
export const overviewModule = {
  name: 'overview-module',
  uses: [dashboardPage, dashboardKpis, landingDashboard],
  operations: [dashboardKpisOperation, landingDashboardOperation],
} as const satisfies ConsoleModule;
