import { type Check, defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import {
  AREA_RESOURCE,
  EVENT_RULE_SCOPE_HISTORY_RESOURCE,
  EVENT_RULE_SCOPE_RESOURCE,
  EVENT_RULE_VERSION_RESOURCE,
  FACILITY_RESOURCE,
  SEGMENT_RESOURCE,
} from '../../data/resource-names';

/** Columns of `itap.event_rule_version_scopes` the `org_admin` role reads; a row is added or removed, never changed. */
export const eventRuleScopeFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  version_id: f.relation({
    to: EVENT_RULE_VERSION_RESOURCE,
    required: true,
    write: 'create',
    texts: { label: 'Version', doc: { summary: 'The rule version the place belongs to.' } },
  }),
  facility_id: f.relation({
    to: FACILITY_RESOURCE,
    nullable: true,
    write: 'create',
    open: 'page',
    texts: {
      label: 'Facility',
      doc: { summary: 'A whole facility the rule applies in, every area of it included.' },
    },
  }),
  area_id: f.relation({
    to: AREA_RESOURCE,
    nullable: true,
    write: 'create',
    open: 'page',
    texts: {
      label: 'Area',
      doc: { summary: 'An area the rule applies in, its sub-areas included.' },
    },
  }),
  segment_id: f.relation({
    to: SEGMENT_RESOURCE,
    nullable: true,
    write: 'create',
    open: 'page',
    providerOptions: { relationship: 'segment' },
    texts: {
      label: 'Segment',
      doc: {
        summary:
          'A segment of people the rule applies to: the person or face of the event is a member at the event time. Places and segments combine: in one of the places and a member of one of the segments.',
      },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Added', in: ['list'] }),
};

/** Exactly one target per row: a facility, an area or a segment (`event_rule_version_scopes_exactly_one_target`). */
export const EVENT_RULE_SCOPE_CHECKS: Check[] = [
  {
    id: 'scopeExactlyOne',
    on: ['create'],
    severity: 'error',
    anchor: 'facility_id',
    texts: 'Choose a facility, an area or a segment: one per row.',
    when: ({ values }) => {
      const set = [values.facility_id, values.area_id, values.segment_id].filter((value) => value !== null && value !== undefined && value !== '');
      return set.length !== 1;
    },
  },
];

const SCOPE_TEXTS = {
  label: 'Scope entry',
  labelPlural: 'Scope',
  doc: {
    summary:
      'Where a rule version applies: facilities, areas or segments of people. A version without any applies everywhere.',
  },
};

/**
 * The scope of an open version (draft or pending): places are added and removed on the
 * version's Scope tab. No page of its own. Every row is one facility, area or segment; none = the
 * whole organization. The database refuses changes once the version is published.
 */
export const eventRuleScope = defineResource(EVENT_RULE_SCOPE_RESOURCE, {
  texts: SCOPE_TEXTS,
  basePath: '/event-rule-scopes',
  displayField: 'facility_id',
  // A scope row of an area or a segment has no facility: shown under every facility.
  data: { provider: 'hasura', scope: { facility: { field: 'facility_id', empty: 'shared' } } },
  operations: { edit: false },
  fields: eventRuleScopeFields,
  checks: EVENT_RULE_SCOPE_CHECKS,
  views: {
    list: { page: false, columns: ['facility_id', 'area_id', 'segment_id', 'created_at'] },
    show: { page: false },
    create: { body: (l) => ['version_id', l.grid(['facility_id', 'area_id', 'segment_id'])] },
  },
});

/**
 * The same rows for a published or superseded version, read only: the scope of a version that
 * was in force never changes (the version's history must say where it applied).
 */
export const eventRuleScopeHistory = defineResource(EVENT_RULE_SCOPE_HISTORY_RESOURCE, {
  texts: { ...SCOPE_TEXTS, label: 'Scope entry (history)' },
  basePath: '/event-rule-scope-history',
  displayField: 'facility_id',
  data: { provider: 'hasura', scope: { facility: { field: 'facility_id', empty: 'shared' } } },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: eventRuleScopeFields,
  views: {
    list: { page: false, columns: ['facility_id', 'area_id', 'segment_id', 'created_at'] },
    show: { page: false },
  },
});
