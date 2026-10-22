import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import { DEVICE_AREA_RESOURCE, DEVICE_RESOURCE } from '../../data/resource-names';
import type { ConsoleModule } from '../module';
import { device } from './device';
import { deviceArea, deviceAreaFields } from './device-area';
import { deviceFields } from './device-fields';

/**
 * Devices: the cameras, access terminals and sensors of each facility (one record type per
 * kind), with their health, credentials, coverage and the areas they also cover.
 */
export const devicesModule = {
  name: 'devices-module',
  uses: [device, deviceArea],
  tables: {
    [DEVICE_RESOURCE]: hasuraTable('devices', { selectFields: selectFieldsOf(deviceFields) }),
    [DEVICE_AREA_RESOURCE]: hasuraTable('device_areas', {
      selectFields: selectFieldsOf(deviceAreaFields),
    }),
  },
} as const satisfies ConsoleModule;
