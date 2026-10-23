import { f } from '@burojs/field-types';
import {
  ACCESS_POINT_RESOURCE,
  CLIENT_APPLICATION_ACCESS_POINT_RESOURCE,
  CLIENT_APPLICATION_ATTRIBUTE_RESOURCE,
  CLIENT_APPLICATION_FACILITY_RESOURCE,
  CLIENT_APPLICATION_MODE_RESOURCE,
  CLIENT_APPLICATION_SEGMENT_RESOURCE,
  FACILITY_RESOURCE,
  SEGMENT_RESOURCE,
} from '../../data/resource-names';
import { AUTH_ATTRIBUTES, AUTH_ATTRIBUTE_ENUM, AUTH_MODES, AUTH_MODE_ENUM } from '../../enums/face-auth';
import { enumField } from '../../enums/field';

/** The five kinds of binding of a client application, each its own junction table. */
export type BindingKind = 'segment' | 'facility' | 'access_point' | 'mode' | 'attribute';

/** One kind of binding: where it is stored and how it reads. */
export interface BindingSpec {
  readonly kind: BindingKind;
  /** The junction resource listing the bindings of this kind. */
  readonly resource: string;
  readonly basePath: string;
  /** The junction table (Hasura root field names derive from it). */
  readonly table: string;
  /** The column naming what is bound. */
  readonly column: string;
  /** The GraphQL type of that column. */
  readonly graphqlType: 'uuid' | 'auth_modes_enum' | 'auth_attributes_enum';
  /** The bound thing, singular and plural, as the lists and flows name it. */
  readonly label: string;
  readonly labelPlural: string;
  /** What a binding of this kind does to the application (the junction resource's summary). */
  readonly summary: string;
  /** The flow that adds one, its label and icon. */
  readonly flow: string;
  readonly flowLabel: string;
  /** Whether a sandbox application may have bindings of this kind (`sandbox_population_check`). */
  readonly sandbox: boolean;
}

/** Every kind of binding, in the order the application page shows them. */
export const BINDINGS: readonly BindingSpec[] = [
  {
    kind: 'segment',
    resource: CLIENT_APPLICATION_SEGMENT_RESOURCE,
    basePath: '/client-application-segments',
    table: 'client_application_segments',
    column: 'segment_id',
    graphqlType: 'uuid',
    label: 'Segment',
    labelPlural: 'Segments',
    summary:
      'A segment whose members the application may authenticate (its members at the moment of each request; an archived segment counts no one). For a sandbox application, the segment of synthetic test identities.',
    flow: 'bind_segment',
    flowLabel: 'Add segment',
    sandbox: true,
  },
  {
    kind: 'facility',
    resource: CLIENT_APPLICATION_FACILITY_RESOURCE,
    basePath: '/client-application-facilities',
    table: 'client_application_facilities',
    column: 'facility_id',
    graphqlType: 'uuid',
    label: 'Facility',
    labelPlural: 'Facilities',
    summary:
      'A facility whose people the application may authenticate: those an access policy or grant lets in there, or who were tracked there in the last 30 days. Never on a sandbox application.',
    flow: 'bind_facility',
    flowLabel: 'Add facility',
    sandbox: false,
  },
  {
    kind: 'access_point',
    resource: CLIENT_APPLICATION_ACCESS_POINT_RESOURCE,
    basePath: '/client-application-access-points',
    table: 'client_application_access_points',
    column: 'access_point_id',
    graphqlType: 'uuid',
    label: 'Access point',
    labelPlural: 'Access points',
    summary:
      'A door the application serves: every session must name one of them, and only people the access rules let through there can be authenticated. Never on a sandbox application.',
    flow: 'bind_access_point',
    flowLabel: 'Add access point',
    sandbox: false,
  },
  {
    kind: 'mode',
    resource: CLIENT_APPLICATION_MODE_RESOURCE,
    basePath: '/client-application-modes',
    table: 'client_application_modes',
    column: 'mode',
    graphqlType: 'auth_modes_enum',
    label: 'Mode',
    labelPlural: 'Modes',
    summary: 'A way the application may authenticate: identification, verification or both. A session in any other mode is refused.',
    flow: 'allow_mode',
    flowLabel: 'Allow mode',
    sandbox: true,
  },
  {
    kind: 'attribute',
    resource: CLIENT_APPLICATION_ATTRIBUTE_RESOURCE,
    basePath: '/client-application-attributes',
    table: 'client_application_attributes',
    column: 'attribute',
    graphqlType: 'auth_attributes_enum',
    label: 'Attribute',
    labelPlural: 'Attributes',
    summary: 'A detail about the authenticated person the application receives with a success; it receives nothing else.',
    flow: 'share_attribute',
    flowLabel: 'Share attribute',
    sandbox: true,
  },
];

/** The binding spec of a kind. */
export function bindingOf(kind: BindingKind): BindingSpec {
  const spec = BINDINGS.find((b) => b.kind === kind);
  if (spec === undefined) throw new Error(`Unknown binding kind ${kind}`);
  return spec;
}

const SEGMENT = {
  to: SEGMENT_RESOURCE,
  required: true,
  open: 'page',
  providerOptions: { relationship: 'segment' },
  texts: { label: 'Segment', doc: { summary: 'The segment whose members the application may authenticate.' } },
} as const;
const FACILITY = {
  to: FACILITY_RESOURCE,
  required: true,
  open: 'page',
  providerOptions: { relationship: 'facility' },
  texts: { label: 'Facility', doc: { summary: 'The facility whose people the application may authenticate.' } },
} as const;
const ACCESS_POINT = {
  to: ACCESS_POINT_RESOURCE,
  required: true,
  open: 'page',
  providerOptions: { relationship: 'access_point' },
  texts: { label: 'Access point', doc: { summary: 'The door, turnstile or gate the application serves.' } },
} as const;
const MODE_TEXTS = { label: 'Mode', doc: { summary: 'Identification (who is this?) or verification (is this the claimed person?).' } };
const ATTRIBUTE_TEXTS = { label: 'Attribute', doc: { summary: 'The detail the application receives about the authenticated person.' } };

/** The bound thing as a junction list reads it (never written there: a binding is added by its flow). */
export const TARGET_READ_FIELDS = {
  segment: { segment_id: f.relation({ ...SEGMENT, write: 'never' }) },
  facility: { facility_id: f.relation({ ...FACILITY, write: 'never' }) },
  access_point: { access_point_id: f.relation({ ...ACCESS_POINT, write: 'never' }) },
  mode: { mode: enumField(AUTH_MODES, AUTH_MODE_ENUM, { required: true, write: 'never', texts: MODE_TEXTS }) },
  attribute: { attribute: enumField(AUTH_ATTRIBUTES, AUTH_ATTRIBUTE_ENUM, { required: true, write: 'never', texts: ATTRIBUTE_TEXTS }) },
} as const;

/** The bound thing as the add flow's form asks for it. */
export const TARGET_FORM_FIELDS = {
  segment: { segment_id: f.relation({ ...SEGMENT, candidates: [{ field: 'status', op: 'ne', value: 'archived' }] }) },
  // Places have no archived state: the ones out of service (`inactive`) are not offered.
  facility: { facility_id: f.relation({ ...FACILITY, candidates: [{ field: 'status', op: 'ne', value: 'inactive' }] }) },
  access_point: { access_point_id: f.relation({ ...ACCESS_POINT, candidates: [{ field: 'status', op: 'ne', value: 'inactive' }] }) },
  mode: { mode: enumField(AUTH_MODES, AUTH_MODE_ENUM, { required: true, texts: MODE_TEXTS }) },
  attribute: { attribute: enumField(AUTH_ATTRIBUTES, AUTH_ATTRIBUTE_ENUM, { required: true, texts: ATTRIBUTE_TEXTS }) },
} as const;
