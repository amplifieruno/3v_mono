import { defineAppDefinition } from '@burojs/core';
import { authProvider } from '../auth/session';
import { HASURA_PROVIDER, createItapHasuraProvider } from '../data/provider';
import { ITAP_ENUMS } from '../enums';
import { organizationInvitation } from '../modules/organization/invitations';
import { inviteMember } from '../modules/organization/invite-member';
import { organizationMember } from '../modules/organization/members';
import { organization } from '../modules/organization/organization';
import { organizationProfilePage } from '../modules/organization/profile-page';
import { user } from '../modules/organization/user';
import { dashboardKpis } from '../modules/overview/kpis';
import { openFile } from '../fields/open-file';
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
  use('itap-operations', dashboardKpis, inviteMember, openFile);
  use('organization-profile-page', organizationProfilePage);
  use('organization-module', organization, organizationMember, organizationInvitation, user);
  use('places-module', facility);
});

/**
 * The runtime the shell and the tests read. The `hasura` provider is owned by
 * the runtime (rebuilt per data session) and sends the browser session's
 * organization token (`../auth/session.ts`), renewed when it is about to expire.
 */
export const app = definition.createRuntime({
  dataProviderFactories: {
    [HASURA_PROVIDER]: () => createItapHasuraProvider(() => authProvider.getToken()),
  },
});
