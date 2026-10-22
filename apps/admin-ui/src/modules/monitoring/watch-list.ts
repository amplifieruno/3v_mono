import { defineResource, relatedList } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import {
  WATCH_LIST_IDENTITY_ENTRY_RESOURCE,
  WATCH_LIST_PROFILE_ENTRY_RESOURCE,
  WATCH_LIST_RESOURCE,
} from '../../data/resource-names';
import { EVENT_SEVERITIES, EVENT_SEVERITY_ENUM } from '../../enums/events';
import { enumField } from '../../enums/field';
import { WATCH_LIST_KINDS, WATCH_LIST_KIND_ENUM } from '../../enums/watch-lists';
import { checkHexColor } from '../../fields/hex-color';
import { checkNotBlank } from '../../fields/not-blank';
import { IDENTITY_ENTRY_COLUMNS, PROFILE_ENTRY_COLUMNS } from './watch-list-entry-fields';

/** Columns of `itap.watch_lists` the `org_admin` role reads and writes. */
export const watchListFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  name: f.string({
    required: true,
    validate: checkNotBlank(),
    texts: { label: 'Name', doc: { summary: 'Unique in the organization; events and notification rules name the list by it.' } },
  }),
  kind: enumField(WATCH_LIST_KINDS, WATCH_LIST_KIND_ENUM, {
    required: true,
    default: 'watch',
    texts: {
      label: 'Kind',
      doc: {
        summary:
          'What a sighting of someone on the list means: a watch-list match, a blacklist match (the profile is marked blacklisted) or a VIP arrival.',
      },
    },
  }),
  severity: enumField(EVENT_SEVERITIES, EVENT_SEVERITY_ENUM, {
    required: true,
    default: 'medium',
    texts: { label: 'Severity', doc: { summary: 'The severity of the events raised when someone on the list is seen.' } },
  }),
  color: f.string({
    nullable: true,
    validate: checkHexColor(),
    texts: { label: 'Colour', doc: { summary: 'How the list is marked on screens, as #rrggbb; empty for none.' } },
  }),
  description: f.text({ nullable: true, in: ['show', 'create', 'edit'], texts: 'Description' }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: ['list', 'show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};

/**
 * Watch lists (`itap.watch_lists`): named lists of people (profiles) and identities the
 * recognition pipeline looks out for. A camera seeing someone on a list raises an event of the
 * list's kind and severity (Stage B). Entries are added on the list's People and Identities tabs,
 * or from the person's own page; deleting a list deletes its entries.
 */
export const watchList = defineResource(WATCH_LIST_RESOURCE, {
  texts: {
    label: 'Watch list',
    labelPlural: 'Watch lists',
    doc: {
      summary:
        'A named list of people and faces the cameras look out for: a watch list, a blacklist or a VIP list, each raising its own events when someone on it is seen.',
    },
  },
  basePath: '/watch-lists',
  section: NAV_SECTIONS.monitoring,
  order: 45,
  icon: NAV_ICONS.watchLists,
  displayField: 'name',
  data: { provider: 'hasura' },
  fields: watchListFields,
  views: {
    list: {
      columns: ['name', 'kind', 'severity', 'color', 'created_at'],
      defaultSort: [{ field: 'name', direction: 'asc' }],
      search: { fields: [{ field: 'name', op: 'contains' }] },
      filters: { fields: ['kind', 'severity'] },
    },
    show: {
      header: (l) => [l.grid(['kind', 'severity', 'color'])],
      body: (l) => {
        const byList = [{ field: 'watch_list_id', op: 'eq', value: l.ref('record', 'id') }] as const;
        return [
          l.tabs(
            [
              l.panel(['name', 'description', l.grid(['created_at', 'updated_at'])], { key: 'details', texts: 'Details' }),
              l.panel(
                [
                  l.place(relatedList(resourceByName(WATCH_LIST_PROFILE_ENTRY_RESOURCE)), {
                    key: 'list-profile-entries',
                    props: {
                      where: [...byList, { field: 'profile_id', op: 'nnull', value: true }],
                      columns: [...PROFILE_ENTRY_COLUMNS],
                      open: 'none',
                    },
                  }),
                ],
                { key: 'people', texts: 'People' },
              ),
              l.panel(
                [
                  l.place(relatedList(resourceByName(WATCH_LIST_IDENTITY_ENTRY_RESOURCE)), {
                    key: 'list-identity-entries',
                    props: {
                      where: [...byList, { field: 'identity_id', op: 'nnull', value: true }],
                      columns: [...IDENTITY_ENTRY_COLUMNS],
                      open: 'none',
                    },
                  }),
                ],
                { key: 'identities', texts: 'Identities' },
              ),
            ],
            { key: 'sections' },
          ),
        ];
      },
    },
    create: { body: (l) => ['name', l.grid(['kind', 'severity', 'color']), 'description'] },
    edit: { body: (l) => ['name', l.grid(['kind', 'severity', 'color']), 'description'] },
  },
});
