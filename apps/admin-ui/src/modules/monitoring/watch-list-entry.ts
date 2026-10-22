import { defineResource } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import {
  WATCH_LIST_ENTRY_RESOURCE,
  WATCH_LIST_IDENTITY_ENTRY_RESOURCE,
  WATCH_LIST_PROFILE_ENTRY_RESOURCE,
} from '../../data/resource-names';
import {
  watchListEntryFields,
  watchListIdentityEntryFields,
  watchListProfileEntryFields,
} from './watch-list-entry-fields';

const ENTRY_SUMMARY =
  'A person or a face on a watch list, with the reason and an optional expiry. While the entry is active, a camera seeing them raises the list’s event.';

/**
 * Every watch-list entry (`itap.watch_list_entries`), whichever its subject: the list page with
 * the "Active" and "Expired" views. An entry names exactly one profile or one identity, so it is
 * added through one of the two subject resources below (each form offers only its subject); here
 * an entry's reason and expiry change and an entry is removed.
 */
export const watchListEntry = defineResource(WATCH_LIST_ENTRY_RESOURCE, {
  texts: { label: 'Watch-list entry', labelPlural: 'Watch-list entries', doc: { summary: ENTRY_SUMMARY } },
  basePath: '/watch-list-entries',
  section: NAV_SECTIONS.monitoring,
  order: 46,
  icon: NAV_ICONS.watchListEntries,
  displayField: 'watch_list_id',
  data: { provider: 'hasura' },
  operations: { create: false },
  fields: watchListEntryFields,
  views: {
    list: {
      columns: ['watch_list_id', 'profile_id', 'identity_id', 'reason', 'expires_at', 'active', 'created_at'],
      optionalColumns: ['added_by'],
      defaultSort: [{ field: 'created_at', direction: 'desc' }],
      filters: { pinned: ['watch_list_id', 'active'], fields: ['watch_list_id', 'active', 'profile_id', 'identity_id', 'expires_at', 'created_at'] },
      savedViews: [
        { id: 'active', texts: 'Active', state: { filters: [{ field: 'active', op: 'eq', value: true }] } },
        { id: 'expired', texts: 'Expired', state: { filters: [{ field: 'active', op: 'eq', value: false }] } },
      ],
    },
    show: {
      header: (l) => [l.grid(['watch_list_id', 'active'])],
      body: (l) => [l.grid(['profile_id', 'identity_id']), 'reason', l.grid(['expires_at', 'added_by', 'created_at'])],
    },
    edit: { body: (l) => [l.grid(['watch_list_id', 'profile_id', 'identity_id']), 'reason', 'expires_at'] },
  },
});

/**
 * The entries of people (`profile_id` set): a list's People tab and a profile's Watch lists tab.
 * The create form names the list and the person only, never an identity.
 */
export const watchListProfileEntry = defineResource(WATCH_LIST_PROFILE_ENTRY_RESOURCE, {
  texts: {
    label: 'Person on a watch list',
    labelPlural: 'People on watch lists',
    doc: { summary: `${ENTRY_SUMMARY} This one names a known person (profile): all of the person’s identities count.` },
  },
  basePath: '/watch-list-people',
  displayField: 'profile_id',
  data: { provider: 'hasura' },
  prefill: { fromQuery: ['watch_list_id', 'profile_id'] },
  fields: watchListProfileEntryFields,
  views: {
    list: { page: false, columns: ['watch_list_id', 'profile_id', 'reason', 'expires_at', 'active'] },
    show: { page: false },
    create: { body: (l) => [l.grid(['watch_list_id', 'profile_id']), 'reason', 'expires_at'] },
    edit: { body: (l) => [l.grid(['watch_list_id', 'profile_id']), 'reason', 'expires_at'] },
  },
});

/**
 * The entries of faces (`identity_id` set): a list's Identities tab and an identity's Watch lists
 * tab. The create form names the list and the identity only, never a profile.
 */
export const watchListIdentityEntry = defineResource(WATCH_LIST_IDENTITY_ENTRY_RESOURCE, {
  texts: {
    label: 'Identity on a watch list',
    labelPlural: 'Identities on watch lists',
    doc: { summary: `${ENTRY_SUMMARY} This one names a single tracked face (identity), such as an unknown person.` },
  },
  basePath: '/watch-list-identities',
  displayField: 'identity_id',
  data: { provider: 'hasura' },
  prefill: { fromQuery: ['watch_list_id', 'identity_id'] },
  fields: watchListIdentityEntryFields,
  views: {
    list: { page: false, columns: ['watch_list_id', 'identity_id', 'reason', 'expires_at', 'active'] },
    show: { page: false },
    create: { body: (l) => [l.grid(['watch_list_id', 'identity_id']), 'reason', 'expires_at'] },
    edit: { body: (l) => [l.grid(['watch_list_id', 'identity_id']), 'reason', 'expires_at'] },
  },
});
