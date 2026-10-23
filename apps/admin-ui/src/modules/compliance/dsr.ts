import { defineResource } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { DSR_RESOURCE } from '../../data/resource-names';
import { DSR_OPEN_STATUSES } from '../../enums/compliance-records';
import {
  newAccessRequestFlow,
  newPortabilityRequestFlow,
  newRectificationRequestFlow,
  newRestrictionRequestFlow,
} from './dsr-create-flows';
import { newErasureRequestFlow } from './dsr-erasure-flow';
import { DSR_COLUMNS, dsrFields } from './dsr-fields';
import { completeDsrFlow, rejectDsrFlow, retryDsrFlow } from './dsr-flows';
import { dsrStepsBlock } from './dsr-steps-block';

const OPEN = { field: 'status', op: 'in', value: [...DSR_OPEN_STATUSES] } as const;

/** The requests list's views; "Overdue" are open requests the platform reported past their due date. */
export const DSR_VIEWS = [
  { id: 'open', texts: 'Open', state: { filters: [OPEN] } },
  { id: 'overdue', texts: 'Overdue', state: { filters: [OPEN, { field: 'overdue_notified_at', op: 'isNotNull' }] } },
  { id: 'erasures', texts: 'Erasures', state: { filters: [{ field: 'request_type', op: 'eq', value: 'erasure' }] } },
  { id: 'partial', texts: 'Partial (legal hold)', state: { filters: [{ field: 'partial', op: 'eq', value: true }] } },
];

/**
 * Data subject requests (`itap.data_subject_requests` with their `dsr_steps`): a person exercising
 * their rights. Filed by one "new request" flow per type; the insert starts the background job
 * (`fulfil_dsr`), which prepares an access or portability bundle, restricts, erases (keeping what
 * a legal hold covers: partial) or hands a rectification to a member. The page follows the job
 * step by step; Reject, Complete (rectification) and Retry close or requeue it. Only the notes
 * are edited; requests are records of compliance and never deleted.
 */
export const dataSubjectRequest = defineResource(DSR_RESOURCE, {
  texts: {
    label: 'Data subject request',
    labelPlural: 'Data subject requests',
    doc: {
      summary:
        'A person asking to see, take, correct, restrict or erase their data (GDPR Art. 15 to 20), with its deadline, the background job’s steps and the outcome.',
    },
  },
  basePath: '/data-subject-requests',
  section: NAV_SECTIONS.compliance,
  order: 50,
  icon: NAV_ICONS.dataSubjectRequests,
  displayField: 'code',
  data: { provider: 'hasura' },
  operations: { create: false, delete: false },
  builtinActions: { delete: false },
  fields: dsrFields,
  actions: (r) => ({
    resource: [
      r.action.flow('new_access', newAccessRequestFlow),
      r.action.flow('new_portability', newPortabilityRequestFlow),
      r.action.flow('new_rectification', newRectificationRequestFlow),
      r.action.flow('new_restriction', newRestrictionRequestFlow),
      r.action.flow('new_erasure', newErasureRequestFlow),
    ],
    item: [r.action.flow('complete', completeDsrFlow), r.action.flow('reject', rejectDsrFlow), r.action.flow('retry', retryDsrFlow)],
  }),
  views: {
    list: {
      columns: [...DSR_COLUMNS],
      defaultSort: [{ field: 'received_at', direction: 'desc' }],
      search: { fields: ['code'] },
      filters: { pinned: ['status', 'request_type'], fields: ['status', 'request_type', 'profile_id', 'received_at', 'due_at', 'partial'] },
      savedViews: DSR_VIEWS,
    },
    show: {
      header: (l) => [l.grid(['code', 'request_type', 'status', 'profile_id'])],
      body: (l) => [
        l.grid(['received_at', 'due_at', 'completed_at', 'partial']),
        l.panel(['rejection_reason'], { key: 'rejected', tone: 'destructive', texts: { title: 'Rejected' }, when: l.present(l.ref('record', 'rejection_reason')) }),
        l.panel(['last_error'], {
          key: 'job-error',
          tone: 'destructive',
          texts: { title: 'The last attempt failed', description: 'The background job tries again with a growing delay; after 5 attempts it stops until Retry.' },
          when: l.present(l.ref('record', 'last_error')),
        }),
        l.panel(['export_file_id'], {
          key: 'bundle',
          texts: { title: 'Bundle', description: 'The person’s data as a zip (bundle.json and their files). Opening it is audited; hand it over securely.' },
          when: l.present(l.ref('record', 'export_file_id')),
        }),
        l.panel(['outcome'], { key: 'outcome', texts: { title: 'Rectification' }, when: l.present(l.ref('record', 'outcome')) }),
        l.tabs(
          [
            l.panel([l.place(dsrStepsBlock, { key: 'steps', props: { requestId: l.ref('record', 'id'), status: l.ref('record', 'status') } })], {
              key: 'steps-tab',
              texts: 'Steps',
            }),
            l.panel(['details', 'notes', l.grid(['requested_by', 'created_at', 'attempts', 'overdue_notified_at'])], { key: 'details-tab', texts: 'Details' }),
          ],
          { key: 'sections' },
        ),
      ],
    },
    // Only the notes are written; the request's subject, type, status and dates are shown for context.
    edit: { body: (l) => [l.grid(['profile_id', 'request_type', 'status']), l.grid(['received_at', 'due_at']), 'notes'] },
  },
});
