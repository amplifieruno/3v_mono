import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import {
  AREA_OCCUPANCY_RESOURCE,
  DETECTION_RESOURCE,
  IDENTITY_LOCATION_RESOURCE,
  TRACKING_SESSION_RESOURCE,
} from '../../data/resource-names';
import { occupancyNowBlock } from '../../blocks/occupancy-now/occupancy-now-block';
import { occupancyRows, occupancyRowsOperation } from '../../blocks/occupancy-now/occupancy-query';
import type { ConsoleModule } from '../module';
import { areaOccupancy } from './area-occupancy';
import { areaOccupancyFields } from './area-occupancy-fields';
import { detection } from './detection';
import { detectionFields } from './detection-fields';
import { identityLocation } from './identity-location';
import { identityLocationFields } from './identity-location-fields';
import { occupancyPage } from './occupancy-page';
import { trackingSession } from './tracking-session';
import { trackingSessionFields } from './tracking-session-fields';

/**
 * Monitoring: what happens in the buildings. Detections (every face a camera recognised),
 * tracking sessions with their paths, the locations they are made of (append-only logs: no
 * count per page, keyset paging), who is where now (polled) and the occupancy of each area on
 * the floor plan.
 */
export const monitoringModule = {
  name: 'monitoring-module',
  uses: [detection, trackingSession, identityLocation, areaOccupancy, occupancyRows, occupancyNowBlock, occupancyPage],
  tables: {
    [DETECTION_RESOURCE]: hasuraTable('detections', {
      selectFields: selectFieldsOf(detectionFields),
      orderByField: 'detected_at',
      noAggregate: true,
    }),
    [TRACKING_SESSION_RESOURCE]: hasuraTable('tracking_sessions', {
      selectFields: selectFieldsOf(trackingSessionFields),
      orderByField: 'started_at',
      noAggregate: true,
    }),
    [IDENTITY_LOCATION_RESOURCE]: hasuraTable('identity_locations', {
      selectFields: selectFieldsOf(identityLocationFields),
      orderByField: 'occurred_at',
      noAggregate: true,
    }),
    [AREA_OCCUPANCY_RESOURCE]: hasuraTable('area_occupancy', {
      selectFields: selectFieldsOf(areaOccupancyFields),
      orderByField: 'last_seen_at',
    }),
  },
  operations: [occupancyRowsOperation],
} as const satisfies ConsoleModule;
