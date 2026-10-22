import { analyticsViews } from './analytics/views';
import { devicesViews } from './devices/views';
import { monitoringViews } from './monitoring/views';
import { notificationsViews } from './notifications/views';
import { organizationViews } from './organization/views';
import { peopleViews } from './people/views';
import { placesViews } from './places/views';
import { segmentsViews } from './segments/views';

/** The block views of every module, composed into `<BuroProvider blockImplementations>`. */
export const MODULE_VIEWS = [...organizationViews, ...placesViews, ...devicesViews, ...peopleViews, ...monitoringViews, ...notificationsViews, ...segmentsViews, ...analyticsViews] as const;
