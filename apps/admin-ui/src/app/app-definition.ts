import { defineAppDefinition } from '@burojs/core';
import { ITAP_ENUMS } from '../enums';
import { organization } from '../modules/organization/organization';
import { facility } from '../modules/places/facility';
import { APP_BLOCKS } from './blocks';
import { NAV_SECTIONS, organizationSection, overviewSection } from './nav';
import { dashboardPage, helpPage } from './pages';

/**
 * The single registration list of the console. Each later module adds its
 * `use(...)` lines here: sections, pages, blocks, enums, resources, operations.
 */
export const definition = defineAppDefinition({ name: 'itap-console' }, ({ use }) => {
  use(NAV_SECTIONS.overview, overviewSection);
  use(NAV_SECTIONS.organization, organizationSection);
  use('dashboard', dashboardPage);
  use('help', helpPage);
  use('itap-blocks', ...APP_BLOCKS);
  use('itap-enums', ...ITAP_ENUMS);
  use('organization-module', organization);
  use('places-module', facility);
});

/** The runtime the shell and the tests read. The `hasura` provider (`../data/provider.ts`) is wired where the runtime mounts. */
export const app = definition.createRuntime();
