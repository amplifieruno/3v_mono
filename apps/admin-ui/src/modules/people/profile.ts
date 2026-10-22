import { type Check, defineResource, facts, relatedList } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import {
  CONSENT_RECORD_RESOURCE,
  IDENTITY_RESOURCE,
  PROFILE_DOCUMENT_RESOURCE,
  PROFILE_RESOURCE,
  VISIT_RESOURCE,
} from '../../data/resource-names';
import { uploadDocumentFlow } from './document-upload';
import { enrollFaceFlow } from './enrollment-flows';
import { PROFILE_ACTIVITY_ROWS, profileActivity } from './profile-activity';
import { EMPLOYEE_FIELD_NAMES, profileFields } from './profile-fields';
import { PROFILE_RULES } from './profile-rules';
import { profileSavedViews } from './profile-views';
import { liftRestrictionFlow, restrictProcessingFlow } from './restriction';

/** `end_date >= start_date` (`profiles_dates_ordered`); dates are `YYYY-MM-DD`, so strings order them. */
export const PROFILE_CHECKS: Check[] = [
  {
    id: 'profileDatesOrdered',
    on: ['create', 'edit'],
    severity: 'error',
    anchor: 'end_date',
    texts: 'The end date cannot be before the start date.',
    when: ({ values }) => {
      const start = values.start_date;
      const end = values.end_date;
      return typeof start === 'string' && typeof end === 'string' && start !== '' && end !== '' && end < start;
    },
  },
];

/**
 * Profiles: the known people of the organization (employees, visitors, contractors, VIPs) with
 * their company, schedule, clearance and the organization's own attributes. One record type per
 * `profile_type`: visitors carry no employment fields, contractors and VIPs only some. Profiles
 * are never deleted (no delete permission): their lifecycle is the status. Restricted and erased
 * profiles say so above their details; an erased profile's fields and flows are disabled with the
 * reason (`./profile-rules.ts`), as the database refuses any change of it. Identities, documents,
 * consent decisions and visits (a visitor's own, or those a person hosts) are tabs of the profile;
 * enrolling a face and restricting processing are flows of its header and menu.
 */
export const profile = defineResource(PROFILE_RESOURCE, {
  texts: {
    label: 'Profile',
    labelPlural: 'Profiles',
    doc: {
      summary:
        'A known person: who they are, which company they belong to, when they are expected and what clearance they have. Cameras recognise the person through the identities (tracked faces) linked to the profile.',
    },
  },
  basePath: '/profiles',
  section: NAV_SECTIONS.people,
  order: 10,
  icon: NAV_ICONS.profiles,
  displayField: 'last_name',
  recordTitle: (record) => `${record.first_name ?? ''} ${record.last_name ?? ''}`.trim() || null,
  data: { provider: 'hasura' },
  operations: { delete: false },
  builtinActions: { delete: false },
  prefill: { fromQuery: ['company_id', 'work_schedule_id'] },
  fields: profileFields,
  checks: PROFILE_CHECKS,
  rules: PROFILE_RULES,
  actions: (r) => ({
    item: [
      r.action.flow('enroll_face', enrollFaceFlow),
      r.action.flow('upload_document', uploadDocumentFlow),
      r.action.flow('restrict_processing', restrictProcessingFlow),
      r.action.flow('lift_restriction', liftRestrictionFlow),
    ],
  }),
  types: {
    by: 'profile_type',
    items: (t) => ({
      employee: t.type({}),
      visitor: t.type({ without: { fields: [...EMPLOYEE_FIELD_NAMES] } }),
      contractor: t.type({ without: { fields: ['employee_id', 'department'] } }),
      vip: t.type({ without: { fields: ['employee_id', 'work_schedule_id'] } }),
    }),
  },
  views: {
    list: {
      columns: ['code', 'last_name', 'first_name', 'profile_type', 'company_id', 'status', 'has_face', 'is_blacklisted'],
      optionalColumns: ['email', 'phone', 'access_level', 'department', 'job_title', 'start_date', 'end_date', 'identities_count', 'processing_restricted'],
      defaultSort: [{ field: 'last_name', direction: 'asc' }],
      search: { fields: ['last_name', 'first_name', 'email', 'code', 'employee_id'] },
      filters: {
        fields: ['profile_type', 'status', 'company_id', 'access_level', 'has_face', 'is_blacklisted', 'processing_restricted', 'start_date', 'end_date'],
      },
      savedViews: profileSavedViews(),
    },
    show: {
      header: (l) => [l.grid(['profile_type', 'status', 'access_level', 'has_face', 'is_blacklisted'])],
      body: (l) => [
        l.panel(['restricted_at', 'restricted_by', 'restriction_reason'], {
          key: 'restricted-notice',
          tone: 'warning',
          texts: {
            title: 'Processing restricted',
            description:
              'The person’s faces are left out of recognition, face authentication, search and dynamic segments, and identities cannot be linked or unlinked. Nothing is deleted.',
          },
          when: l.equals(l.ref('record', 'processing_restricted'), true),
        }),
        l.panel(['erased_at'], {
          key: 'erased-notice',
          tone: 'destructive',
          texts: {
            title: 'Erased',
            description:
              'The person’s data was erased on request. This profile is a tombstone kept for the history that refers to it; it cannot be changed.',
          },
          when: l.present(l.ref('record', 'erased_at')),
        }),
        l.tabs(
          [
            l.panel(
              [
                'avatar_file_id',
                l.grid(['first_name', 'last_name', 'code']),
                l.grid(['email', 'phone', 'company_id']),
                l.grid([...EMPLOYEE_FIELD_NAMES]),
                l.grid(['start_date', 'end_date', 'external_id']),
                'notes',
                'custom_fields',
                l.grid(['processing_restricted', 'created_at', 'updated_at']),
              ],
              { key: 'details', texts: 'Details' },
            ),
            l.panel(
              [
                'identities_count',
                l.place(relatedList(resourceByName(IDENTITY_RESOURCE)), {
                  key: 'profile-identities',
                  props: {
                    where: [{ field: 'profile_id', op: 'eq', value: l.ref('record', 'id') }],
                    columns: [
                      'primary_photo_file_id',
                      'code',
                      'status',
                      'is_primary_for_profile',
                      'link_strength',
                      'last_seen_at',
                      'detection_count',
                    ],
                  },
                }),
              ],
              { key: 'identities', texts: 'Identities' },
            ),
            l.panel(
              [
                l.place(relatedList(resourceByName(PROFILE_DOCUMENT_RESOURCE)), {
                  key: 'profile-documents',
                  props: {
                    where: [{ field: 'profile_id', op: 'eq', value: l.ref('record', 'id') }],
                    columns: ['title', 'kind', 'file_id', 'version', 'valid_until', 'created_at'],
                  },
                }),
              ],
              { key: 'documents', texts: 'Documents' },
            ),
            l.panel(
              [
                l.place(relatedList(resourceByName(CONSENT_RECORD_RESOURCE)), {
                  key: 'profile-consents',
                  props: {
                    // Also seeds "+ Create": a new consent is recorded for this person.
                    where: [{ field: 'profile_id', op: 'eq', value: l.ref('record', 'id') }],
                    columns: ['purpose', 'status', 'method', 'granted_at', 'withdrawn_at'],
                  },
                }),
              ],
              { key: 'consent', texts: 'Consent' },
            ),
            l.panel(
              [
                // A visitor's own visits; anyone else's are the visits they host (a visitor never hosts).
                l.panel(
                  [
                    l.place(relatedList(resourceByName(VISIT_RESOURCE)), {
                      key: 'profile-visits',
                      props: {
                        // Also seeds "+ Create": a new visit is for this visitor.
                        where: [{ field: 'visitor_profile_id', op: 'eq', value: l.ref('record', 'id') }],
                        columns: ['code', 'expected_start', 'expected_end', 'host_profile_id', 'status', 'checked_in_at'],
                      },
                    }),
                  ],
                  { key: 'visits-as-visitor', when: l.equals(l.ref('record', 'profile_type'), 'visitor') },
                ),
                l.panel(
                  [
                    l.place(relatedList(resourceByName(VISIT_RESOURCE)), {
                      key: 'profile-hosted-visits',
                      props: {
                        // Also seeds "+ Create": a new visit is hosted by this person.
                        where: [{ field: 'host_profile_id', op: 'eq', value: l.ref('record', 'id') }],
                        columns: ['code', 'expected_start', 'expected_end', 'visitor_profile_id', 'status', 'checked_in_at'],
                      },
                    }),
                  ],
                  {
                    key: 'visits-hosted',
                    texts: { title: 'Hosted visits' },
                    when: l.not(l.equals(l.ref('record', 'profile_type'), 'visitor')),
                  },
                ),
              ],
              { key: 'visits', texts: 'Visits' },
            ),
            l.panel(
              [
                l.place(facts, {
                  key: 'activity-facts',
                  props: {
                    query: profileActivity,
                    input: { profileId: l.ref('record', 'id') },
                    rows: [...PROFILE_ACTIVITY_ROWS],
                    view: 'grid',
                  },
                  texts: { missing: 'No activity computed yet: figures appear after the hourly statistics run once the person has been seen.' },
                }),
              ],
              { key: 'activity', texts: 'Activity' },
            ),
          ],
          { key: 'sections' },
        ),
      ],
    },
    edit: {
      body: (l) => [
        l.grid(['profile_type', 'status', 'access_level']),
        l.grid(['first_name', 'last_name']),
        'avatar_file_id',
        l.grid(['email', 'phone']),
        'company_id',
        l.panel([l.grid([...EMPLOYEE_FIELD_NAMES])], { key: 'employment', texts: 'Employment' }),
        l.grid(['start_date', 'end_date', 'external_id']),
        'notes',
        'custom_fields',
      ],
    },
  },
});
