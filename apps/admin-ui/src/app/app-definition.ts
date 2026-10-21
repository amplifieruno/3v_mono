import { defineAppDefinition } from '@burojs/core';
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
});

/** The runtime the shell and the tests read. Data providers are wired by the data task. */
export const app = definition.createRuntime();
