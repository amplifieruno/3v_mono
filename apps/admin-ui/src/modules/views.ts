import { accessViews } from './access/views';
import { analyticsViews } from './analytics/views';
import { complianceViews } from './compliance/views';
import { devicesViews } from './devices/views';
import { faceAuthViews } from './face-auth/views';
import { monitoringViews } from './monitoring/views';
import { notificationsViews } from './notifications/views';
import { organizationViews } from './organization/views';
import { peopleViews } from './people/views';
import { placesViews } from './places/views';
import { searchViews } from './search/views';
import { segmentsViews } from './segments/views';

/** The block views of every module, composed into `<BuroProvider blockImplementations>`. */
export const MODULE_VIEWS = [...organizationViews, ...placesViews, ...devicesViews, ...peopleViews, ...searchViews, ...monitoringViews, ...notificationsViews, ...segmentsViews, ...analyticsViews, ...accessViews, ...faceAuthViews, ...complianceViews] as const;
