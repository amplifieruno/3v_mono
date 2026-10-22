import type { TranslationBundle } from '@burojs/i18n-core';

/**
 * Reports in the `common` namespace (English, primary): the cron field's sentence parts and chrome
 * (`console.cron`, `src/fields/cron-format.ts` `CRON_PHRASES`), the parameters field
 * (`console.reportParameters`) and the refusals of reusable validators (`validation.itap.cron`,
 * `validation.itap.reportPeriod`). Kept apart from `../locales/<locale>.ts` for size; the registry
 * deep-merges it into `common`.
 */
export default {
  console: {
    cron: {
      everyMinute: 'Every minute',
      everyMinutes: 'Every {{step}} minutes',
      atMinutes: 'At minute {{minutes}} of every hour',
      atTimes: 'At {{times}}',
      duringHours: '{{minutes}}, during hours {{hours}}',
      everyDay: 'every day',
      onWeekdays: 'on {{days}}',
      onMonthDays: 'on day {{days}} of the month',
      onEither: 'on day {{days}} of the month or on {{weekdays}}',
      inMonths: 'in {{months}}',
      never: 'Never runs: none of its months has these days.',
      invalid: 'not a schedule the platform accepts',
      empty: 'Five fields: minute hour day-of-month month weekday (0 or 7 = Sunday), for example 0 7 * * 1.',
      presets: {
        daily: 'Daily 07:00',
        weekdays: 'Weekdays 07:00',
        weekly: 'Mondays 07:00',
        monthly: '1st of the month 07:00',
      },
    },
    reportParameters: {
      timezone: 'time zone {{zone}}',
      defaults: 'Defaults (the organization’s time zone)',
      defaultPeriod: 'Default (previous day)',
    },
  },
  validation: {
    itap: {
      cron: {
        invalid:
          'Not a schedule the platform accepts: five fields (minute hour day month weekday), each *, a number, a range a-b or a list, optionally /step; for example 0 7 * * 1 (Mondays at 07:00).',
      },
      reportPeriod: {
        endBeforeStart: 'The end date cannot be before the start date.',
        tooLong: 'A report covers at most 367 days: the end date can be at most 366 days after the start date (it is {{days}} days after).',
      },
    },
  },
} satisfies TranslationBundle;
