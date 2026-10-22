import { type Check, defineResource, facts } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { PROFILE_RESOURCE } from '../../data/resource-names';
import { PROFILE_ACTIVITY_ROWS, profileActivity } from './profile-activity';
import { EMPLOYEE_FIELD_NAMES, profileFields } from './profile-fields';
import { profileSavedViews } from './profile-views';

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
 * profiles say so above their details; what they freeze is enforced by the database.
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
            // Task 3 places the linked identities here (relatedList of `identity`).
            l.panel([l.grid(['has_face', 'identities_count'])], { key: 'identities', texts: 'Identities' }),
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
