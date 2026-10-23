import { type Check, defineResource, relatedList } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import {
  PROCESSING_ACTIVITY_DATA_CLASS_RESOURCE,
  PROCESSING_ACTIVITY_RESOURCE,
  RETENTION_POLICY_RESOURCE,
  USER_RESOURCE,
} from '../../data/resource-names';
import { DPIA_STATUSES, DPIA_STATUS_ENUM, LEGAL_BASES, LEGAL_BASIS_ENUM } from '../../enums/compliance-records';
import { enumField } from '../../enums/field';
import { checkNotBlank } from '../../fields/not-blank';
import { storageFile } from '../../fields/storage-file';

/** `storage.files.metadata.kind` of a DPIA document: an ordinary organization file (not sensitive). */
export const DPIA_KIND = 'dpia';

/** Columns of `itap.processing_activities` the `org_admin` role reads and writes. */
export const processingActivityFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  code: f.string({ system: true, in: ['list', 'show'], texts: { label: 'Code', doc: { summary: 'The activity’s reference in the record of processing (PA-00003).' } } }),
  name: f.string({ required: true, validate: checkNotBlank(), texts: { label: 'Name', doc: { summary: 'What the processing is, such as "Face recognition in common areas".' } } }),
  purpose: f.text({
    required: true,
    validate: checkNotBlank(),
    in: ['show', 'create', 'edit'],
    texts: { label: 'Purpose', doc: { summary: 'Why the personal data is processed, as the record of processing (Art. 30) states it.' } },
  }),
  legal_basis: enumField(LEGAL_BASES, LEGAL_BASIS_ENUM, {
    required: true,
    texts: { label: 'Legal basis', doc: { summary: 'The ground of GDPR Art. 6(1) that makes the processing lawful.' } },
  }),
  description: f.text({ nullable: true, in: ['show', 'create', 'edit'], texts: { label: 'Description', doc: { summary: 'How the processing works: sources, recipients, safeguards.' } } }),
  retention_policy_id: f.relation({
    to: RETENTION_POLICY_RESOURCE,
    nullable: true,
    open: 'page',
    texts: { label: 'Retention policy', doc: { summary: 'The policy that decides how long the activity’s data is kept; a referenced policy can be deactivated, not deleted.' } },
  }),
  dpia_status: enumField(DPIA_STATUSES, DPIA_STATUS_ENUM, {
    required: true,
    default: 'not_required',
    texts: { label: 'DPIA', doc: { summary: 'Where the data protection impact assessment (Art. 35) stands: not required, required, in progress or approved.' } },
  }),
  dpia_file_id: storageFile({
    bucket: 'organization',
    kind: DPIA_KIND,
    accept: '.pdf,.doc,.docx,application/pdf',
    maxSize: 20 * 1024 * 1024,
    in: ['show', 'create', 'edit'],
    texts: { label: 'DPIA document', doc: { summary: 'The impact assessment itself (PDF or Word, up to 20 MB), readable by the organization’s administrators.' } },
  }),
  owner_id: f.relation({
    to: USER_RESOURCE,
    nullable: true,
    open: 'none',
    texts: { label: 'Owner', doc: { summary: 'The member accountable for the activity; an active member of the organization.' } },
  }),
  is_active: f.boolean({
    default: true,
    texts: { label: 'Active', doc: { summary: 'Whether the processing still takes place; an inactive activity stays in the record as history.' } },
  }),
  created_by: f.relation({
    to: USER_RESOURCE,
    system: true,
    nullable: true,
    in: ['show'],
    open: 'none',
    texts: { label: 'Created by', doc: { summary: 'The member who recorded the activity.' } },
  }),
  created_at: f.dateTime({ system: true, in: ['show'], texts: { label: 'Created', doc: { summary: 'When the activity was recorded.' } } }),
  updated_at: f.dateTime({ system: true, in: ['list', 'show'], texts: { label: 'Updated', doc: { summary: 'When the activity was last changed.' } } }),
};

/** An approved DPIA should carry its document (a warning: the database does not require it). */
export const PROCESSING_ACTIVITY_CHECKS: Check[] = [
  {
    id: 'dpiaApprovedWithoutFile',
    severity: 'warning',
    on: ['create', 'edit'],
    anchor: 'dpia_file_id',
    texts: 'The DPIA is approved but no document is attached: attach the approved assessment so the record can show it.',
    when: ({ values }) => values.dpia_status === 'approved' && (values.dpia_file_id === null || values.dpia_file_id === undefined || values.dpia_file_id === ''),
  },
];

const FORM = ['name', 'purpose', 'legal_basis', 'description', 'retention_policy_id', 'owner_id', 'is_active'] as const;

/**
 * Records of processing (`itap.processing_activities`, GDPR Art. 30): what the organization does
 * with personal data, why, on which legal basis, how long it is kept (a retention policy), which
 * data classes it touches (Data classes tab) and the impact assessment (DPIA) with its document.
 */
export const processingActivity = defineResource(PROCESSING_ACTIVITY_RESOURCE, {
  texts: {
    label: 'Processing activity',
    labelPlural: 'Processing activities',
    doc: {
      summary:
        'One entry of the record of processing: a purpose, its legal basis, the data classes it handles, its retention policy, owner and impact assessment (DPIA).',
    },
  },
  basePath: '/processing-activities',
  section: NAV_SECTIONS.compliance,
  order: 60,
  icon: NAV_ICONS.processingActivities,
  displayField: 'name',
  data: { provider: 'hasura' },
  fields: processingActivityFields,
  checks: PROCESSING_ACTIVITY_CHECKS,
  views: {
    list: {
      columns: ['code', 'name', 'legal_basis', 'dpia_status', 'retention_policy_id', 'owner_id', 'is_active', 'updated_at'],
      defaultSort: [{ field: 'code', direction: 'asc' }],
      search: { fields: [{ field: 'name', op: 'contains' }, 'code'] },
      filters: { pinned: ['legal_basis', 'dpia_status'], fields: ['legal_basis', 'dpia_status', 'is_active', 'owner_id'] },
      savedViews: [
        { id: 'dpia-open', texts: 'DPIA to do', state: { filters: [{ field: 'dpia_status', op: 'in', value: ['required', 'in_progress'] }] } },
        { id: 'active', texts: 'Active', state: { filters: [{ field: 'is_active', op: 'eq', value: true }] } },
      ],
    },
    show: {
      header: (l) => [l.grid(['code', 'legal_basis', 'dpia_status', 'is_active'])],
      body: (l) => [
        l.tabs(
          [
            l.panel(['name', 'purpose', 'description', l.grid(['retention_policy_id', 'owner_id']), l.grid(['created_by', 'created_at', 'updated_at'])], {
              key: 'details',
              texts: 'Details',
            }),
            l.panel(
              [
                l.place(relatedList(resourceByName(PROCESSING_ACTIVITY_DATA_CLASS_RESOURCE)), {
                  key: 'activity-data-classes',
                  // Also seeds "+ Create": the new class is for this activity.
                  props: { where: [{ field: 'activity_id', op: 'eq', value: l.ref('record', 'id') }], columns: ['data_class', 'created_at'], open: 'none' },
                }),
              ],
              { key: 'data-classes', texts: 'Data classes' },
            ),
            l.panel(['dpia_status', 'dpia_file_id'], { key: 'dpia', texts: 'DPIA' }),
          ],
          { key: 'sections' },
        ),
      ],
    },
    create: { body: (l) => [...FORM, l.grid(['dpia_status', 'dpia_file_id'])] },
    edit: { body: (l) => [...FORM, l.grid(['dpia_status', 'dpia_file_id'])] },
  },
});
