import { defineBlock, defineCustomPage } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';

/**
 * The body of the organization profile page: the record screen of the
 * organization the token is scoped to (`./organization-profile-view.tsx`).
 * buro has no "current record" resource kind (gap G13), so the page reads the
 * id from the identity and renders `RecordScreen` itself.
 */
export const organizationProfileBlock = defineBlock('itap:organization-profile', {
  texts: 'Organization profile',
});

/** "Organization" in the sidebar: the current organization's profile, editable in place. */
export const organizationProfilePage = defineCustomPage({
  name: 'organization-profile',
  icon: NAV_ICONS.organization,
  path: '/organization-profile',
  texts: 'Organization',
  section: NAV_SECTIONS.organization,
  order: 10,
  body: (l) => [l.place(organizationProfileBlock, { key: 'profile' })],
});
