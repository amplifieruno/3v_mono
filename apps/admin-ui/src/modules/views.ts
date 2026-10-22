import { devicesViews } from './devices/views';
import { organizationViews } from './organization/views';
import { placesViews } from './places/views';

/** The block views of every module, composed into `<BuroProvider blockImplementations>`. */
export const MODULE_VIEWS = [...organizationViews, ...placesViews, ...devicesViews] as const;
