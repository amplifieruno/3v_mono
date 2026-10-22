import { defineBlock, defineCustomPage } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';

/**
 * The body of the preferences page: the signed-in user's `user_settings` form
 * (`./preferences-view.tsx`), an edit of the row when it exists and a create when
 * it does not yet (gap G13: no current-record screen).
 */
export const preferencesBlock = defineBlock('itap:preferences', { texts: 'My preferences' });

/** "My preferences" in the sidebar: the signed-in user's language and time zone. */
export const preferencesPage = defineCustomPage({
  name: 'preferences',
  icon: NAV_ICONS.preferences,
  path: '/preferences',
  texts: 'My preferences',
  section: NAV_SECTIONS.organization,
  order: 90,
  body: (l) => [l.place(preferencesBlock, { key: 'preferences' })],
});
