import { composeBlockImplementations, implementBlock } from '@burojs/react';
import { dashboardBlock, helpBlock } from './blocks';
import { HelpPage } from './help-page';

/** The dashboard body renders nothing until the dashboard KPIs land. */
const EmptyDashboard = (): null => null;

/** The views of the app's own blocks, handed to `<BuroProvider blockImplementations>`. */
export const appBlockImplementations = composeBlockImplementations(
  implementBlock(dashboardBlock, { component: EmptyDashboard }),
  implementBlock(helpBlock, { component: HelpPage }),
);
