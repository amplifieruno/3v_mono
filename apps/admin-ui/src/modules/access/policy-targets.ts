import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import {
  ACCESS_POINT_RESOURCE,
  ACCESS_POLICY_ACCESS_POINT_TARGET_RESOURCE,
  ACCESS_POLICY_AREA_TARGET_RESOURCE,
  ACCESS_POLICY_FACILITY_TARGET_RESOURCE,
  ACCESS_POLICY_TARGET_RESOURCE,
  ACCESS_POLICY_VERSION_RESOURCE,
  AREA_RESOURCE,
  FACILITY_RESOURCE,
} from '../../data/resource-names';

/*
 * Where a policy version applies (`itap.access_policy_version_targets`): each row is exactly one
 * of a facility, an area (with the areas inside it) or an access point
 * (`access_policy_version_targets_exactly_one_target`). One resource per kind for a draft, each
 * requiring its own column (G45), and a read-only resource over every row. The rows are never
 * narrowed by the sidebar facility: whoever approves a version must see every place it names.
 */

const FACILITY = {
  to: FACILITY_RESOURCE,
  open: 'page',
  providerOptions: { relationship: 'facility' },
  texts: { label: 'Facility', doc: { summary: 'Every door of the facility.' } },
} as const;
const AREA = {
  to: AREA_RESOURCE,
  open: 'page',
  providerOptions: { relationship: 'area' },
  texts: { label: 'Area', doc: { summary: 'Every door leading into the area or into an area inside it.' } },
} as const;
const ACCESS_POINT = {
  to: ACCESS_POINT_RESOURCE,
  open: 'page',
  providerOptions: { relationship: 'access_point' },
  texts: { label: 'Access point', doc: { summary: 'One door, turnstile or gate.' } },
} as const;

const common = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  version_id: f.relation({
    to: ACCESS_POLICY_VERSION_RESOURCE,
    required: true,
    write: 'create',
    texts: { label: 'Version', doc: { summary: 'The policy version the target belongs to.' } },
  }),
  created_at: f.dateTime({ system: true, texts: 'Added', in: ['list'] }),
};

export const facilityTargetFields = { ...common, facility_id: f.relation({ ...FACILITY, required: true, write: 'create' }) };
export const areaTargetFields = { ...common, area_id: f.relation({ ...AREA, required: true, write: 'create' }) };
export const accessPointTargetFields = { ...common, access_point_id: f.relation({ ...ACCESS_POINT, required: true, write: 'create' }) };
/** Every target of a version, whichever kind: each row sets one of the three. */
export const policyTargetFields = {
  ...common,
  facility_id: f.relation({ ...FACILITY, nullable: true, write: 'never' }),
  area_id: f.relation({ ...AREA, nullable: true, write: 'never' }),
  access_point_id: f.relation({ ...ACCESS_POINT, nullable: true, write: 'never' }),
};

export const TARGET_COLUMNS = ['facility_id', 'area_id', 'access_point_id'] as const;

/** Every target of a version, read only: a submitted, published or superseded version's, on its Where tab. */
export const policyTarget = defineResource(ACCESS_POLICY_TARGET_RESOURCE, {
  texts: {
    label: 'Target',
    labelPlural: 'Targets',
    doc: { summary: 'Where a policy version applies: facilities, areas (with the areas inside them) or single access points.' },
  },
  basePath: '/access-policy-targets',
  displayField: 'created_at',
  data: { provider: 'hasura' },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: policyTargetFields,
  views: { list: { page: false, columns: [...TARGET_COLUMNS] }, show: { page: false } },
});

interface TwinSpec {
  readonly name: string;
  readonly basePath: string;
  readonly label: string;
  readonly labelPlural: string;
  readonly summary: string;
  readonly column: string;
}

/** One kind of target on a draft's Where tab: listed, added and removed; no page of its own. */
function targetTwin<F extends typeof common>(spec: TwinSpec, fields: F) {
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

export const facilityTarget = targetTwin(
  {
    name: ACCESS_POLICY_FACILITY_TARGET_RESOURCE,
    basePath: '/access-policy-facility-targets',
    label: 'Facility',
    labelPlural: 'Facilities',
    summary: 'Whole facilities a draft policy version applies in: every door of each.',
    column: 'facility_id',
  },
  facilityTargetFields,
);
export const areaTarget = targetTwin(
  {
    name: ACCESS_POLICY_AREA_TARGET_RESOURCE,
    basePath: '/access-policy-area-targets',
    label: 'Area',
    labelPlural: 'Areas',
    summary: 'Areas a draft policy version applies in: every door into each area or an area inside it.',
    column: 'area_id',
  },
  areaTargetFields,
);
export const accessPointTarget = targetTwin(
  {
    name: ACCESS_POLICY_ACCESS_POINT_TARGET_RESOURCE,
    basePath: '/access-policy-access-point-targets',
    label: 'Access point',
    labelPlural: 'Access points',
    summary: 'Single doors, turnstiles or gates a draft policy version applies at.',
    column: 'access_point_id',
  },
  accessPointTargetFields,
);
