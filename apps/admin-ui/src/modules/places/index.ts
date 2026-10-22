import { floorPlanBlock } from '../../blocks/floor-plan/floor-plan-block';
import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import {
  ACCESS_POINT_DEVICE_RESOURCE,
  ACCESS_POINT_RESOURCE,
  AREA_RESOURCE,
  FACILITY_RESOURCE,
  FACILITY_TEMPLATE_RESOURCE,
  FLOOR_PLAN_RESOURCE,
} from '../../data/resource-names';
import type { ConsoleModule } from '../module';
import { accessPoint, accessPointFields } from './access-point';
import { accessPointDevice, accessPointDeviceFields } from './access-point-device';
import { applyFacilityTemplate, applyFacilityTemplateOperation } from './apply-template';
import { area, areaFields } from './area';
import { areaParentGuardBlock } from './area-parent-guard-block';
import { areaTreeBlock } from './area-tree-block';
import { facility, facilityFields } from './facility';
import { facilityTemplate, facilityTemplateFields } from './facility-template';
import { floorPlan, floorPlanFields } from './floor-plan';
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
