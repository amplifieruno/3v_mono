import { type Layout, relatedList } from '@burojs/core';
import { resourceByName } from '../../data/resource-by-name';
import { VISIT_RESOURCE } from '../../data/resource-names';
import type { profileFields } from './profile-fields';

/**
 * A profile's Visits tab: a visitor's own visits; anyone else's are the visits they host (a
 * visitor never hosts). Each list also seeds "+ Create" with this person.
 */
export function profileVisitsPanel(l: Layout<typeof profileFields>) {
  return l.panel(
    [
      l.panel(
        [
          l.place(relatedList(resourceByName(VISIT_RESOURCE)), {
            key: 'profile-visits',
            props: {
              // Also seeds "+ Create": a new visit is for this visitor.
              where: [{ field: 'visitor_profile_id', op: 'eq', value: l.ref('record', 'id') }],
              columns: ['code', 'expected_start', 'expected_end', 'host_profile_id', 'status', 'checked_in_at'],
            },
          }),
        ],
        { key: 'visits-as-visitor', when: l.equals(l.ref('record', 'profile_type'), 'visitor') },
      ),
      l.panel(
        [
          l.place(relatedList(resourceByName(VISIT_RESOURCE)), {
            key: 'profile-hosted-visits',
            props: {
              // Also seeds "+ Create": a new visit is hosted by this person.
              where: [{ field: 'host_profile_id', op: 'eq', value: l.ref('record', 'id') }],
              columns: ['code', 'expected_start', 'expected_end', 'visitor_profile_id', 'status', 'checked_in_at'],
            },
          }),
        ],
        {
          key: 'visits-hosted',
          texts: { title: 'Hosted visits' },
          when: l.not(l.equals(l.ref('record', 'profile_type'), 'visitor')),
        },
      ),
    ],
    { key: 'visits', texts: 'Visits' },
  );
}
