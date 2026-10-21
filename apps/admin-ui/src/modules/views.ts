import { organizationViews } from './organization/views';

/** The block views of every module, composed into `<BuroProvider blockImplementations>`. */
export const MODULE_VIEWS = [...organizationViews] as const;
