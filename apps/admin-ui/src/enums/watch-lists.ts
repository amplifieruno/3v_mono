import { defineEnum } from '@burojs/core';
import { enumValues } from './values';

/* Watch-list enums; values are the rows of the Hasura enum tables in `WATCH_LIST_ENUM_TABLES`. */

export const WATCH_LIST_KIND_ENUM = 'watch_list_kind';

export const WATCH_LIST_KINDS = ['watch', 'blacklist', 'vip'] as const;

export const watchListKindEnum = defineEnum({
  name: WATCH_LIST_KIND_ENUM,
  values: enumValues(WATCH_LIST_KINDS, { watch: 'warning', blacklist: 'destructive', vip: 'info' }),
  texts: {
    watch: {
      label: 'Watch',
      doc: { summary: 'Someone to keep an eye on: a "watch-list match" event when a camera sees them.' },
    },
    blacklist: {
      label: 'Blacklist',
      doc: {
        summary:
          'Someone not allowed on the premises: a "blacklist match" event when seen, and the profile is marked blacklisted.',
      },
    },
    vip: { label: 'VIP', doc: { summary: 'Someone to welcome: a "VIP arrival" event when a camera sees them arrive.' } },
  },
});

/** Each enum above by the Hasura enum table holding its values. */
export const WATCH_LIST_ENUM_TABLES: Readonly<Record<string, string>> = {
  [WATCH_LIST_KIND_ENUM]: 'watch_list_kinds',
};
