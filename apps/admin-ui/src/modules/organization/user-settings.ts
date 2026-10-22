import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { timezone } from '../../fields/timezone';

export const USER_SETTINGS_RESOURCE = 'user_settings';

/** The shape notification templates take (`notification_templates_locale_format`): `en`, `de-AT`. */
const LOCALE_FORMAT = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/** `null` for a language code template locales can match (or nothing), else the message. */
export const checkLocale = (value: unknown): string | null =>
  value === null ||
  value === undefined ||
  value === '' ||
  (typeof value === 'string' && LOCALE_FORMAT.test(value))
    ? null
    : 'Enter a language code such as en, ru or de-AT.';

/** Columns of `itap.user_settings` the `org_admin` role reads (its own row only). */
export const userSettingsFields = {
  user_id: f.uuid({ system: true, texts: 'User', in: [] }),
  locale: f.string({
    nullable: true,
    validate: checkLocale,
    texts: {
      label: 'Language',
      description:
        'A language code such as en, ru or de-AT. Empty = each notification in its template’s own language.',
      doc: {
        summary:
          'The language notifications are sent to you in: a template in this language is picked first, then the template’s own language. The console itself is in English for now.',
      },
    },
  }),
  timezone: timezone({
    texts: {
      label: 'Time zone',
      doc: {
        summary:
          'Your time zone, kept with your account for every organization. Not applied yet: the console shows times in the browser’s time zone, and schedules and reports use their own.',
      },
    },
  }),
  last_organization_id: f.uuid({
    system: true,
    in: [],
    texts: {
      label: 'Last organization',
      doc: { summary: 'The organization you last worked in; opened first at sign-in.' },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: [] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};

/**
 * The signed-in user's own preferences (`itap.user_settings`, one row per account,
 * keyed by `user_id`, shared by all organizations). Hasura lets each user read and
 * write only their own row, created on first save. Edited on the "Preferences" page
 * (`./preferences-page.ts`); no list, no delete.
 */
export const userSettings = defineResource(USER_SETTINGS_RESOURCE, {
  texts: {
    label: 'Preferences',
    labelPlural: 'Preferences',
    doc: {
      summary:
        'Your personal settings, the same in every organization you belong to: the language of your notifications and your time zone.',
    },
  },
  operations: { delete: false },
  builtinActions: { delete: false },
  data: { provider: 'hasura', idField: 'user_id' },
  fields: userSettingsFields,
  views: { list: { page: false } },
});
