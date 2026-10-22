import { fieldImplementation } from '@burojs/react';
import { z } from 'zod';
import { DASHBOARD_WIDGETS_FIELD } from './dashboard-widgets';
import { DashboardWidgetsDisplay } from './dashboard-widgets-display';
import { DashboardWidgetsInput } from './dashboard-widgets-input';

/** The `itap.dashboard-widgets` input and display, for `composeFieldImplementations`. */
export const dashboardWidgetsImplementations = {
  [DASHBOARD_WIDGETS_FIELD]: fieldImplementation({
    meta: z.object({}),
    Input: DashboardWidgetsInput,
    Display: DashboardWidgetsDisplay,
  }),
};
