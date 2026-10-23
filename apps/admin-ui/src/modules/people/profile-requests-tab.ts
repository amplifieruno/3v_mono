import { type Layout, relatedList } from '@burojs/core';
import { resourceByName } from '../../data/resource-by-name';
import { DSR_RESOURCE } from '../../data/resource-names';
import type { profileFields } from './profile-fields';

/**
 * A profile's Requests tab: the data subject requests about the person (access, erasure,
 * rectification...), newest first. New requests are filed from Compliance → Data subject
 * requests, after the person's identity is verified.
 */
export function profileRequestsPanel(l: Layout<typeof profileFields>) {
  return l.panel(
    [
      l.place(relatedList(resourceByName(DSR_RESOURCE)), {
        key: 'profile-requests',
        props: {
          where: [{ field: 'profile_id', op: 'eq', value: l.ref('record', 'id') }],
          columns: ['code', 'request_type', 'status', 'received_at', 'due_at', 'completed_at', 'partial'],
          open: 'page',
        },
      }),
    ],
    { key: 'requests', texts: 'Requests' },
  );
}
