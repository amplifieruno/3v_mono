import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { timeWindows } from '../../fields/time-windows';
import { timezone } from '../../fields/timezone';
import { WORK_SCHEDULE_RESOURCE } from '../../data/resource-names';

export { WORK_SCHEDULE_RESOURCE };

/** Columns of `itap.work_schedules` the `org_admin` role reads; the module's `index.ts` mapping selects these. */
export const workScheduleFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  name: f.string({ required: true, texts: 'Name' }),
  timezone: timezone({
    required: true,
    default: 'UTC',
    texts: {
      label: 'Time zone',
      doc: {
        summary:
          'The zone the windows are read in: 08:00 means 08:00 local time there, daylight saving included.',
      },
    },
  }),
  windows: timeWindows({
    // `[]` is never on shift: `itap.in_windows` matches nothing (segments, rostered checks).
    emptyText: 'Never on shift',
    texts: {
      label: 'Windows',
      description:
        'Days and hours on shift. A window whose end is before its start ends the next day.',
      doc: {
        summary:
          'The weekly hours people on this schedule are expected on site. A window such as 22:00–06:00 starts on the selected day and ends the next morning; 00:00–24:00 is the whole day. No windows means never on shift.',
      },
    },
  }),
  description: f.text({ nullable: true, texts: 'Description' }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: [] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated' }),
};

/**
 * Work schedules: weekly shift hours in a time zone. Profiles point at one; segments
 * ("on shift now"), after-hours events, attendance reports and face authentication
 * (applications that narrow by work schedule) read them.
 */
export const workSchedule = defineResource(WORK_SCHEDULE_RESOURCE, {
  texts: {
    label: 'Work schedule',
    labelPlural: 'Work schedules',
    doc: {
      summary:
        'Weekly shift hours in a time zone, such as office days or a night shift. People are assigned a schedule on their profile; rules, segments and reports compare activity with it.',
    },
  },
  basePath: '/work-schedules',
  section: NAV_SECTIONS.organization,
  order: 60,
  icon: NAV_ICONS.workSchedules,
  displayField: 'name',
  data: { provider: 'hasura' },
  fields: workScheduleFields,
  views: {
    list: {
      columns: ['name', 'timezone', 'windows', 'description'],
      defaultSort: [{ field: 'name', direction: 'asc' }],
      search: { fields: ['name'] },
    },
  },
});
