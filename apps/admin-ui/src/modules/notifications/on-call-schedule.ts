import { defineResource, relatedList } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import {
  ESCALATION_ON_CALL_STEP_RESOURCE,
  ON_CALL_SCHEDULE_MEMBER_RESOURCE,
  ON_CALL_SCHEDULE_RESOURCE,
  USER_RESOURCE,
} from '../../data/resource-names';
import { rangeValidator } from '../../fields/bounded-number';
import { dateTime } from '../../fields/date-time';
import { checkNotBlank } from '../../fields/not-blank';
import { timezone } from '../../fields/timezone';
import { ON_CALL_STEP_COLUMNS } from './escalation-steps';
import { ON_CALL_MEMBER_COLUMNS } from './on-call-members';

/** `on_call_schedules_shift_length_positive`. */
const SHIFT_HOURS = { min: 1, integer: true } as const;

/**
 * Columns of `itap.on_call_schedules` the `org_admin` role reads. Who is on call now and until when
 * are computed fields over `itap.on_call_member(schedule, now())`, the function the escalation
 * cron picks the person with; a vacation delegate is applied by the cron when it sends, not here.
 */
export const onCallScheduleFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  name: f.string({
    required: true,
    validate: checkNotBlank(),
    texts: { label: 'Name', doc: { summary: 'The schedule’s name, unique in the organization.' } },
  }),
  description: f.text({ nullable: true, in: ['show', 'create', 'edit'], texts: 'Description' }),
  timezone: timezone({
    required: true,
    default: 'UTC',
    texts: {
      label: 'Time zone',
      doc: {
        summary:
          'The zone the team plans the rotation in. Shifts are counted in hours from the rotation start, so a daylight-saving change does not move a hand-over.',
      },
    },
  }),
  shift_length_hours: f.number({
    required: true,
    integer: true,
    min: SHIFT_HOURS.min,
    default: 24,
    validate: rangeValidator(SHIFT_HOURS),
    texts: {
      label: 'Shift length (hours)',
      doc: { summary: 'How long each person is on call before the next one takes over: 24 for daily shifts, 168 for weekly ones.' },
    },
  }),
  rotation_start_at: dateTime({
    required: true,
    texts: {
      label: 'Rotation start',
      doc: {
        summary:
          'When the first shift begins, held by the person at the lowest position. Every later shift starts a shift length after the one before; a time before the start counts backwards.',
      },
    },
  }),
  on_call_user_id: f.relation({
    to: USER_RESOURCE,
    system: true,
    nullable: true,
    in: ['list', 'show'],
    open: 'none',
    texts: {
      label: 'On call now',
      doc: {
        summary:
          'The person whose shift it is now (the next active member when they are deactivated or expired), as the escalation job picks them. A vacation delegate, if they have one, is applied when a page is sent and is not shown here. Empty when nobody in the rotation is active.',
      },
    },
  }),
  shift_ends_at: dateTime({
    system: true,
    in: ['show'],
    texts: {
      label: 'Shift ends',
      doc: { summary: 'When the current shift ends and the next person in the rotation takes over; shown while someone is on call.' },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};

/**
 * On-call schedules (`itap.on_call_schedules`): a rotation of people, one on call per shift of
 * `shift_length_hours` counted from `rotation_start_at`, in the order of their positions. Steps of
 * escalation policies page the person on call; a schedule a step uses cannot be deleted until the
 * step is changed (`escalation_policy_steps_schedule_fkey`).
 */
export const onCallSchedule = defineResource(ON_CALL_SCHEDULE_RESOURCE, {
  texts: {
    label: 'On-call schedule',
    labelPlural: 'On-call schedules',
    doc: {
      summary:
        'A rotation of people taking turns on call, shift by shift: escalation steps page whoever is on call when they run.',
    },
  },
  basePath: '/on-call-schedules',
  section: NAV_SECTIONS.notifications,
  order: 50,
  icon: NAV_ICONS.onCallSchedules,
  displayField: 'name',
  data: { provider: 'hasura' },
  fields: onCallScheduleFields,
  views: {
    list: {
      columns: ['name', 'on_call_user_id', 'shift_length_hours', 'timezone'],
      defaultSort: [{ field: 'name', direction: 'asc' }],
      search: { fields: [{ field: 'name', op: 'contains' }] },
    },
    show: {
      // The shift end means nothing while nobody is on call (no members, nobody active).
      header: (l) => [l.grid(['on_call_user_id', l.field('shift_ends_at', { when: l.present(l.ref('record', 'on_call_user_id')) })])],
      body: (l) => [
        'name',
        'description',
        l.grid(['shift_length_hours', 'rotation_start_at', 'timezone']),
        l.tabs(
          [
            l.panel(
              [
                l.place(relatedList(resourceByName(ON_CALL_SCHEDULE_MEMBER_RESOURCE)), {
                  key: 'schedule-members',
                  // Also seeds "+ Create": a new member rotates in this schedule.
                  props: {
                    where: [{ field: 'schedule_id', op: 'eq', value: l.ref('record', 'id') }],
                    columns: [...ON_CALL_MEMBER_COLUMNS],
                    open: 'none',
                  },
                }),
              ],
              { key: 'rotation', texts: 'Rotation' },
            ),
            l.panel(
              [
                l.place(relatedList(resourceByName(ESCALATION_ON_CALL_STEP_RESOURCE)), {
                  key: 'schedule-steps',
                  props: {
                    where: [{ field: 'on_call_schedule_id', op: 'eq', value: l.ref('record', 'id') }],
                    columns: ['policy_id', ...ON_CALL_STEP_COLUMNS],
                    open: 'none',
                  },
                }),
              ],
              { key: 'steps', texts: 'Escalation steps paging it' },
            ),
          ],
          { key: 'sections' },
        ),
        l.grid(['created_at', 'updated_at']),
      ],
    },
    create: { body: (l) => ['name', 'description', l.grid(['shift_length_hours', 'rotation_start_at', 'timezone'])] },
    edit: { body: (l) => ['name', 'description', l.grid(['shift_length_hours', 'rotation_start_at', 'timezone'])] },
  },
});
