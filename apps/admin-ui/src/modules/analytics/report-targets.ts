import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import {
  FACILITY_RESOURCE,
  REPORT_FACILITY_RESOURCE,
  REPORT_RESOURCE,
  REPORT_SEGMENT_RESOURCE,
  SEGMENT_RESOURCE,
} from '../../data/resource-names';

const report = f.relation({
  to: REPORT_RESOURCE,
  required: true,
  write: 'never',
  providerOptions: { relationship: 'report' },
  texts: { label: 'Report', doc: { summary: 'The report this target belongs to.' } },
});

/** Columns of `itap.report_facilities` the `org_admin` role reads. */
export const reportFacilityFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  report_id: report,
  facility_id: f.relation({
    to: FACILITY_RESOURCE,
    required: true,
    write: 'never',
    open: 'page',
    providerOptions: { relationship: 'facility' },
    texts: { label: 'Facility', doc: { summary: 'A facility the report covers.' } },
  }),
};

/** Columns of `itap.report_segments` the `org_admin` role reads. */
export const reportSegmentFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  report_id: report,
  segment_id: f.relation({
    to: SEGMENT_RESOURCE,
    required: true,
    write: 'never',
    open: 'page',
    providerOptions: { relationship: 'segment' },
    texts: { label: 'Segment', doc: { summary: 'A segment the report covers.' } },
  }),
};

const readOnly = { create: false, edit: false, delete: false } as const;

/**
 * The facilities a report covers (`report_facilities`): inserted with the report and frozen once its
 * generation starts, so the console only reads them (the report's "Facilities" chips). They describe
 * the report, not a place to narrow by: the sidebar facility does not filter them.
 */
export const reportFacility = defineResource(REPORT_FACILITY_RESOURCE, {
  texts: {
    label: 'Report facility',
    labelPlural: 'Report facilities',
    doc: { summary: 'A facility a report covers; a report with none covers every facility.' },
  },
  basePath: '/report-facilities',
  displayField: 'facility_id',
  data: { provider: 'hasura' },
  operations: readOnly,
  builtinActions: { edit: false, delete: false },
  fields: reportFacilityFields,
  views: { list: { page: false, columns: ['facility_id'] }, show: { page: false } },
});

/** The segments a segment report covers (`report_segments`), read only like the facilities. */
export const reportSegment = defineResource(REPORT_SEGMENT_RESOURCE, {
  texts: {
    label: 'Report segment',
    labelPlural: 'Report segments',
    doc: { summary: 'A segment a segment report covers; a report with none covers every segment.' },
  },
  basePath: '/report-segments',
  displayField: 'segment_id',
  data: { provider: 'hasura' },
  operations: readOnly,
  builtinActions: { edit: false, delete: false },
  fields: reportSegmentFields,
  views: { list: { page: false, columns: ['segment_id'] }, show: { page: false } },
});
