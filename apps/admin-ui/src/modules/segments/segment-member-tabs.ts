import { type Layout, type ScreenRef, ref, relatedList } from '@burojs/core';
import { resourceByName } from '../../data/resource-by-name';
import {
  CURRENT_IDENTITY_MEMBER_COLUMNS,
  CURRENT_PROFILE_MEMBER_COLUMNS,
  PAST_IDENTITY_MEMBER_COLUMNS,
  PAST_PROFILE_MEMBER_COLUMNS,
  SUBJECT_MEMBERSHIP_COLUMNS,
} from './segment-member-fields';
import { type SegmentTarget, MEMBER_RESOURCE_OF } from './segment-membership-checks';

const COLUMNS = {
  profiles: { current: CURRENT_PROFILE_MEMBER_COLUMNS, past: PAST_PROFILE_MEMBER_COLUMNS },
  identities: { current: CURRENT_IDENTITY_MEMBER_COLUMNS, past: PAST_IDENTITY_MEMBER_COLUMNS },
} as const;

/** Any screen's field map: the panels read only the record's `id` (and a segment's `target`). */
type Fields = Readonly<Record<string, unknown>>;

/** A record ref for a layout typed by another resource's fields (the panels serve several). */
const recordRef = (field: string) => ref('record', field) as unknown as ScreenRef<'record'>;

const OPEN = { field: 'removed_at', op: 'null', value: true } as const;
const ENDED = { field: 'removed_at', op: 'nnull', value: true } as const;

/**
 * A segment's Members tab: its current members and, below, the memberships that ended (the
 * history is never deleted), each list over the membership resource of the segment's target and
 * shown only for that target. A row opens the membership, where a manual one can be removed.
 */
export function segmentMembersPanel<F extends Fields>(l: Layout<F>) {
  const lists = (['profiles', 'identities'] as const).flatMap((target) => {
    const { resource, subject } = MEMBER_RESOURCE_OF[target];
    const when = l.equals(recordRef('target'), target);
    const mine = [
      { field: 'segment_id', op: 'eq', value: recordRef('id') },
      { field: subject, op: 'nnull', value: true },
    ] as const;
    return [
      l.place(relatedList(resourceByName(resource)), {
        key: `segment-${target}-current`,
        when,
        texts: { title: 'Current members' },
        props: { where: [...mine, OPEN], columns: [...COLUMNS[target].current] },
      }),
      l.place(relatedList(resourceByName(resource)), {
        key: `segment-${target}-past`,
        when,
        texts: { title: 'Earlier memberships' },
        props: { where: [...mine, ENDED], columns: [...COLUMNS[target].past] },
      }),
    ];
  });
  return l.panel(lists, { key: 'members', texts: 'Members' });
}

/**
 * A person's or a face's Segments tab: the segments they are in now, then those they left. A row
 * opens the membership, where a manual one can be removed.
 */
export function subjectSegmentsPanel<F extends Fields>(l: Layout<F>, target: SegmentTarget) {
  const { resource, subject } = MEMBER_RESOURCE_OF[target];
  const mine = { field: subject, op: 'eq', value: recordRef('id') } as const;
  return l.panel(
    [
      l.place(relatedList(resourceByName(resource)), {
        key: `${target}-segments-current`,
        texts: { title: 'Member now' },
        props: { where: [mine, OPEN], columns: [...SUBJECT_MEMBERSHIP_COLUMNS] },
      }),
      l.place(relatedList(resourceByName(resource)), {
        key: `${target}-segments-past`,
        texts: { title: 'Earlier memberships' },
        props: { where: [mine, ENDED], columns: [...SUBJECT_MEMBERSHIP_COLUMNS] },
      }),
    ],
    { key: 'segments', texts: 'Segments' },
  );
}
