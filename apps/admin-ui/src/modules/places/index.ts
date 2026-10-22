import { floorPlanBlock } from '../../blocks/floor-plan/floor-plan-block';
import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import type { ConsoleModule } from '../module';
import { ACCESS_POINT_RESOURCE, accessPoint, accessPointFields } from './access-point';
import {
  ACCESS_POINT_DEVICE_RESOURCE,
  accessPointDevice,
  accessPointDeviceFields,
} from './access-point-device';
import { applyFacilityTemplate, applyFacilityTemplateOperation } from './apply-template';
import { AREA_RESOURCE, area, areaFields } from './area';
import { areaParentGuardBlock } from './area-parent-guard-block';
import { areaTreeBlock } from './area-tree-block';
import { FACILITY_RESOURCE, facility, facilityFields } from './facility';
import {
  FACILITY_TEMPLATE_RESOURCE,
  facilityTemplate,
  facilityTemplateFields,
} from './facility-template';
import { FLOOR_PLAN_RESOURCE, floorPlan, floorPlanFields } from './floor-plan';
import { facilityOccupancyNow, facilityOccupancyNowOperation } from './occupancy';
import { templateOverlapBlock } from './template-overlap-block';

/**
 * Places: facilities (behind the sidebar facility picker too) with their occupancy now, their
 * area trees, floor plans with the areas and access points drawn on them, access points with
 * their bound devices, and facility templates applied to a facility in one step.
 */
export const placesModule = {
  name: 'places-module',
  uses: [
    facility,
    area,
    floorPlan,
    accessPoint,
    accessPointDevice,
    facilityTemplate,
    facilityOccupancyNow,
    applyFacilityTemplate,
    areaTreeBlock,
    areaParentGuardBlock,
    floorPlanBlock,
    templateOverlapBlock,
  ],
  tables: {
    [FACILITY_RESOURCE]: hasuraTable('facilities', { selectFields: selectFieldsOf(facilityFields) }),
    [AREA_RESOURCE]: hasuraTable('areas', { selectFields: selectFieldsOf(areaFields) }),
    [FLOOR_PLAN_RESOURCE]: hasuraTable('floor_plans', {
      selectFields: selectFieldsOf(floorPlanFields),
    }),
    [ACCESS_POINT_RESOURCE]: hasuraTable('access_points', {
      selectFields: selectFieldsOf(accessPointFields),
    }),
    [ACCESS_POINT_DEVICE_RESOURCE]: hasuraTable('access_point_devices', {
      selectFields: selectFieldsOf(accessPointDeviceFields),
    }),
    [FACILITY_TEMPLATE_RESOURCE]: hasuraTable('facility_templates', {
      selectFields: selectFieldsOf(facilityTemplateFields),
    }),
  },
  operations: [facilityOccupancyNowOperation, applyFacilityTemplateOperation],
} as const satisfies ConsoleModule;
