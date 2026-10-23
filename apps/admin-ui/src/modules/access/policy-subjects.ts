import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import {
  ACCESS_POLICY_ACCESS_LEVEL_SUBJECT_RESOURCE,
  ACCESS_POLICY_PROFILE_SUBJECT_RESOURCE,
  ACCESS_POLICY_PROFILE_TYPE_SUBJECT_RESOURCE,
  ACCESS_POLICY_SEGMENT_SUBJECT_RESOURCE,
  ACCESS_POLICY_SUBJECT_RESOURCE,
  ACCESS_POLICY_VERSION_RESOURCE,
  PROFILE_RESOURCE,
  SEGMENT_RESOURCE,
} from '../../data/resource-names';
import { enumField } from '../../enums/field';
import { ACCESS_LEVELS, ACCESS_LEVEL_ENUM, PROFILE_TYPES, PROFILE_TYPE_ENUM } from '../../enums/people';

/*
 * Who a policy version names (`itap.access_policy_version_subjects`): each row is exactly one of a
 * person, a segment, a profile type or a minimum access level
 * (`access_policy_version_subjects_exactly_one_subject`). As for watch-list entries (G45), the
 * rows are one resource per kind, each form offering and requiring its own column, plus a read-only
 * resource over every row (the version's history and a submitted version). A row is added or
 * removed, never changed, and only while the version is a draft (guard triggers).
 */

const PROFILE = {
  to: PROFILE_RESOURCE,
  open: 'page',
  providerOptions: { relationship: 'profile' },
  texts: { label: 'Person', doc: { summary: 'One known person, by profile; every face linked to the profile counts.' } },
} as const;
const SEGMENT = {
  to: SEGMENT_RESOURCE,
  open: 'page',
  providerOptions: { relationship: 'segment' },
  texts: {
    label: 'Segment',
    doc: {
      summary:
        'Whoever is a member of the segment at the moment of the decision. The segment’s own conditions and members change without a new approval.',
    },
  },
} as const;
const TYPE_TEXTS = { label: 'Profile type', doc: { summary: 'Everyone with a profile of this type: employees, visitors, contractors or VIPs.' } };
const LEVEL_TEXTS = {
  label: 'Access level',
  doc: { summary: 'A minimum clearance: everyone whose profile’s access level is this one or higher.' },
};

const common = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  version_id: f.relation({
    to: ACCESS_POLICY_VERSION_RESOURCE,
    required: true,
    write: 'create',
    texts: { label: 'Version', doc: { summary: 'The policy version the subject belongs to.' } },
  }),
  created_at: f.dateTime({ system: true, texts: 'Added', in: ['list'] }),
};

/** A subject naming one person. */
export const profileSubjectFields = { ...common, profile_id: f.relation({ ...PROFILE, required: true, write: 'create' }) };
/** A subject naming a segment (only segments that are not archived are offered). */
export const segmentSubjectFields = {
  ...common,
  segment_id: f.relation({ ...SEGMENT, required: true, write: 'create', candidates: [{ field: 'status', op: 'ne', value: 'archived' }] }),
};
/** A subject naming a profile type. */
export const profileTypeSubjectFields = {
  ...common,
  profile_type: enumField(PROFILE_TYPES, PROFILE_TYPE_ENUM, { required: true, write: 'create', texts: TYPE_TEXTS }),
};
/** A subject naming a minimum access level. */
export const accessLevelSubjectFields = {
  ...common,
  access_level: enumField(ACCESS_LEVELS, ACCESS_LEVEL_ENUM, { required: true, write: 'create', texts: LEVEL_TEXTS }),
};
/** Every subject of a version, whichever kind: each row sets one of the four. */
export const policySubjectFields = {
  ...common,
  profile_id: f.relation({ ...PROFILE, nullable: true, write: 'never' }),
  segment_id: f.relation({ ...SEGMENT, nullable: true, write: 'never' }),
  profile_type: enumField(PROFILE_TYPES, PROFILE_TYPE_ENUM, { nullable: true, write: 'never', texts: TYPE_TEXTS }),
  access_level: enumField(ACCESS_LEVELS, ACCESS_LEVEL_ENUM, { nullable: true, write: 'never', texts: LEVEL_TEXTS }),
};

export const SUBJECT_COLUMNS = ['profile_id', 'segment_id', 'profile_type', 'access_level'] as const;

/** Every subject of a version, read only: a submitted, published or superseded version's, on its Who tab. */
export const policySubject = defineResource(ACCESS_POLICY_SUBJECT_RESOURCE, {
  texts: {
    label: 'Subject',
    labelPlural: 'Subjects',
    doc: { summary: 'Who a policy version applies to: people, segments, profile types or minimum access levels; any one of them matches.' },
  },
  basePath: '/access-policy-subjects',
  displayField: 'created_at',
  data: { provider: 'hasura' },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: policySubjectFields,
  views: { list: { page: false, columns: [...SUBJECT_COLUMNS] }, show: { page: false } },
});

interface TwinSpec {
  readonly name: string;
  readonly basePath: string;
  readonly label: string;
  readonly labelPlural: string;
  readonly summary: string;
  readonly column: string;
}

/** One kind of subject on a draft's Who tab: listed, added and removed; no page of its own. */
function subjectTwin<F extends typeof common>(spec: TwinSpec, fields: F) {
  return defineResource(spec.name, {
    texts: { label: spec.label, labelPlural: spec.labelPlural, doc: { summary: spec.summary } },
    basePath: spec.basePath,
    displayField: spec.column as keyof F & string,
    data: { provider: 'hasura' },
    prefill: { fromQuery: ['version_id'] },
    operations: { edit: false },
    fields,
    views: {
      list: { page: false, columns: [spec.column as keyof F & string, 'created_at'] },
      // No create body: the form shows the version, then the subject's own column (declaration order).
      show: { page: false },
    },
  });
}

export const profileSubject = subjectTwin(
  {
    name: ACCESS_POLICY_PROFILE_SUBJECT_RESOURCE,
    basePath: '/access-policy-profile-subjects',
    label: 'Person',
    labelPlural: 'People',
    summary: 'Single people a draft policy version names, by profile.',
    column: 'profile_id',
  },
  profileSubjectFields,
);
export const segmentSubject = subjectTwin(
  {
    name: ACCESS_POLICY_SEGMENT_SUBJECT_RESOURCE,
    basePath: '/access-policy-segment-subjects',
    label: 'Segment',
    labelPlural: 'Segments',
    summary: 'Segments a draft policy version names: their members at the moment of each decision.',
    column: 'segment_id',
  },
  segmentSubjectFields,
);
export const profileTypeSubject = subjectTwin(
  {
    name: ACCESS_POLICY_PROFILE_TYPE_SUBJECT_RESOURCE,
    basePath: '/access-policy-profile-type-subjects',
    label: 'Profile type',
    labelPlural: 'Profile types',
    summary: 'Profile types a draft policy version names: everyone with a profile of that type.',
    column: 'profile_type',
  },
  profileTypeSubjectFields,
);
export const accessLevelSubject = subjectTwin(
  {
    name: ACCESS_POLICY_ACCESS_LEVEL_SUBJECT_RESOURCE,
    basePath: '/access-policy-access-level-subjects',
    label: 'Minimum access level',
    labelPlural: 'Minimum access levels',
    summary: 'Clearances a draft policy version names: everyone at that access level or higher.',
    column: 'access_level',
  },
  accessLevelSubjectFields,
);
