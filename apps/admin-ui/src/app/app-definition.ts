import { type AppRuntime, defineAppDefinition } from '@burojs/core';
import { HASURA_PROVIDER, createItapHasuraProvider } from '../data/provider';
import { ITAP_ENUMS } from '../enums';
import { CONSOLE_MODULES } from '../modules';
import { helpBlock } from './blocks';
import { currentRecordFrame } from './current-record-frame';
import {
  NAV_SECTIONS,
  accessSection,
  analyticsSection,
  devicesSection,
  monitoringSection,
  notificationsSection,
  organizationSection,
  overviewSection,
  peopleSection,
  placesSection,
  searchSection,
} from './nav';
import { helpPage } from './pages';

/**
 * The console's registration list: the app's own sections, Help and enums,
 * then one `use` per module (`../modules/index.ts`). A new module is added
 * there, not here.
 */
export const definition = defineAppDefinition({ name: 'itap-console' }, ({ use }) => {
  use(NAV_SECTIONS.overview, overviewSection);
  use(NAV_SECTIONS.organization, organizationSection);
  use(NAV_SECTIONS.places, placesSection);
  use(NAV_SECTIONS.devices, devicesSection);
  use(NAV_SECTIONS.people, peopleSection);
  use(NAV_SECTIONS.search, searchSection);
  use(NAV_SECTIONS.monitoring, monitoringSection);
  use(NAV_SECTIONS.notifications, notificationsSection);
  use(NAV_SECTIONS.analytics, analyticsSection);
  use(NAV_SECTIONS.access, accessSection);
  use('help', helpPage, helpBlock);
  use('frames', currentRecordFrame);
  use('itap-enums', ...ITAP_ENUMS);
  for (const mod of CONSOLE_MODULES) use(mod.name, ...mod.uses);
});

/**
 * A runtime of the console whose `hasura` provider (rebuilt per data session)
 * sends the organization token `getToken` answers. `<AppRuntime>` builds one
 * per mount from its `auth` prop, so the token has one source.
 */
export function createConsoleRuntime(getToken: () => Promise<string | null>): AppRuntime {
  return definition.createRuntime({
    dataProviderFactories: {
      [HASURA_PROVIDER]: () => createItapHasuraProvider(getToken),
    },
  });
}

/**
 * A runtime without a session, for what reads the registry only (route
 * descriptors, checks, the docs corpus): its provider sends no token.
 */
export const app = createConsoleRuntime(() => Promise.resolve(null));
