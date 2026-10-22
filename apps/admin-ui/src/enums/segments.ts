import { defineEnum } from '@burojs/core';
import { enumValues } from './values';

/* Segment enums; values are the rows of the Hasura enum tables in `SEGMENT_ENUM_TABLES`. */

export const SEGMENT_KIND_ENUM = 'segment_kind';
export const SEGMENT_TARGET_ENUM = 'segment_target';
export const SEGMENT_STATUS_ENUM = 'segment_status';
export const SEGMENT_MEMBER_SOURCE_ENUM = 'segment_member_source';

export const SEGMENT_KINDS = ['manual', 'dynamic'] as const;
export const SEGMENT_TARGETS = ['identities', 'profiles'] as const;
export const SEGMENT_STATUSES = ['active', 'inactive', 'archived'] as const;
export const SEGMENT_MEMBER_SOURCES = ['manual', 'rule'] as const;

export const segmentKindEnum = defineEnum({
  name: SEGMENT_KIND_ENUM,
  values: enumValues(SEGMENT_KINDS, { manual: 'secondary', dynamic: 'info' }),
  texts: {
    manual: { label: 'Manual', doc: { summary: 'Members are added and removed by hand; the segment has no conditions.' } },
    dynamic: {
      label: 'Dynamic',
      doc: {
        summary:
          'Members are the people or faces matching the conditions, re-evaluated as the data changes (plus any added by hand).',
      },
    },
  },
});

export const segmentTargetEnum = defineEnum({
  name: SEGMENT_TARGET_ENUM,
  values: enumValues(SEGMENT_TARGETS, { identities: 'secondary', profiles: 'secondary' }),
  texts: {
    identities: {
      label: 'Identities',
      doc: { summary: 'Faces the cameras know, linked to a profile or not (unknown people included).' },
    },
    profiles: { label: 'Profiles', doc: { summary: 'Known people with a profile: employees, visitors, contractors.' } },
  },
});

export const segmentStatusEnum = defineEnum({
  name: SEGMENT_STATUS_ENUM,
  values: enumValues(SEGMENT_STATUSES, { active: 'success', inactive: 'secondary', archived: 'outline' }),
  texts: {
    active: { label: 'Active', doc: { summary: 'Evaluated and usable by rules, policies and reports.' } },
    inactive: {
      label: 'Inactive',
      doc: { summary: 'Kept but not evaluated: a dynamic segment closes its rule memberships until it is active again.' },
    },
    archived: {
      label: 'Archived',
      doc: { summary: 'Retired: no members can be added, the membership history is kept.' },
    },
  },
});

export const segmentMemberSourceEnum = defineEnum({
  name: SEGMENT_MEMBER_SOURCE_ENUM,
  values: enumValues(SEGMENT_MEMBER_SOURCES, { manual: 'secondary', rule: 'info' }),
  texts: {
    manual: { label: 'Manual', doc: { summary: 'Added by a person.' } },
    rule: { label: 'Rule', doc: { summary: 'Added by the evaluation of the segment’s conditions.' } },
  },
});

/** Each enum above by the Hasura enum table holding its values. */
export const SEGMENT_ENUM_TABLES: Readonly<Record<string, string>> = {
  [SEGMENT_KIND_ENUM]: 'segment_kinds',
  [SEGMENT_TARGET_ENUM]: 'segment_targets',
  [SEGMENT_STATUS_ENUM]: 'segment_statuses',
  [SEGMENT_MEMBER_SOURCE_ENUM]: 'segment_member_sources',
};
