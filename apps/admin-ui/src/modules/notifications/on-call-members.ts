import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { ON_CALL_SCHEDULE_MEMBER_RESOURCE, ON_CALL_SCHEDULE_RESOURCE, USER_RESOURCE } from '../../data/resource-names';
import { rangeValidator } from '../../fields/bounded-number';

/** `on_call_schedule_members_position_nonnegative`. */
const POSITION = { min: 0, integer: true } as const;

/**
 * Columns of `itap.on_call_schedule_members`: one person in a rotation, at a position. The
 * rotation follows the positions from the lowest up (buro has no drag reordering, G51: change a
 * position to move a person); each position and each person once per schedule.
 */
export const onCallScheduleMemberFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  schedule_id: f.relation({
    to: ON_CALL_SCHEDULE_RESOURCE,
    required: true,
    write: 'create',
    open: 'page',
    texts: { label: 'Schedule', doc: { summary: 'The on-call schedule the person rotates in.' } },
  }),
  position: f.number({
    required: true,
    integer: true,
    min: POSITION.min,
    validate: rangeValidator(POSITION),
    texts: {
      label: 'Position',
      doc: {
        summary:
          'The person’s place in the rotation: shifts pass from the lowest position up and start again after the highest. Each position once per schedule; gaps are fine (10, 20, 30 leaves room to insert someone).',
      },
    },
  }),
  user_id: f.relation({
    to: USER_RESOURCE,
    required: true,
    open: 'none',
    texts: {
      label: 'Member',
      doc: {
        summary:
          'A person of the organization, active when added; each person once per schedule. A member deactivated or expired later keeps their place, and their shifts pass to the next active person.',
      },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Added', in: [] }),
};

export const ON_CALL_MEMBER_COLUMNS = ['position', 'user_id'] as const;

/** The rotation of an on-call schedule, on the schedule's Rotation tab; no page of its own. */
export const onCallScheduleMember = defineResource(ON_CALL_SCHEDULE_MEMBER_RESOURCE, {
  texts: {
    label: 'Rotation member',
    labelPlural: 'Rotation',
    doc: { summary: 'A person in an on-call rotation, at a position: shifts pass from the lowest position up.' },
  },
  basePath: '/on-call-members',
  displayField: 'user_id',
  data: { provider: 'hasura' },
  prefill: { fromQuery: ['schedule_id'] },
  fields: onCallScheduleMemberFields,
  views: {
    list: { page: false, columns: [...ON_CALL_MEMBER_COLUMNS], defaultSort: [{ field: 'position', direction: 'asc' }] },
    show: { page: false },
    create: { body: (l) => ['schedule_id', l.grid(['position', 'user_id'])] },
    edit: { body: (l) => ['schedule_id', l.grid(['position', 'user_id'])] },
  },
});
