import { f } from '@burojs/field-types';
import { ACCESS_POLICY_VERSION_RESOURCE, USER_RESOURCE } from '../../data/resource-names';
import { dateTime } from '../../fields/date-time';
import { checkNotBlank } from '../../fields/not-blank';

/**
 * Columns of `itap.access_policies` the `org_admin` role reads. Name and description are written
 * by a person; the version in force and the archive columns only by the approval and archive
 * functions (guarded in the database, also against the admin secret).
 */
export const accessPolicyFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  code: f.string({
    system: true,
    in: ['list', 'show', 'edit'],
    texts: { label: 'Code', doc: { summary: 'The policy’s number in the organization (POL-00004), given on creation.' } },
  }),
  name: f.string({
    required: true,
    validate: checkNotBlank(),
    texts: { label: 'Name', doc: { summary: 'What the policy is for, such as “Employees: main turnstiles”; unique in the organization.' } },
  }),
  description: f.text({ nullable: true, in: ['show', 'create', 'edit'], texts: 'Description' }),
  current_version_id: f.relation({
    to: ACCESS_POLICY_VERSION_RESOURCE,
    system: true,
    nullable: true,
    in: ['list', 'show'],
    open: 'page',
    providerOptions: { relationship: 'current_version' },
    texts: {
      label: 'Version in force',
      doc: {
        summary:
          'The approved version the doors decide by; empty until a first version is approved, and again once the policy is archived. Changed only by approving a version.',
      },
    },
  }),
  is_archived: f.boolean({
    system: true,
    in: ['list', 'show'],
    texts: {
      label: 'Archived',
      doc: {
        summary:
          'Retired for good: no version is in force and no new version can be drafted. The versions and the decisions they made stay as history.',
      },
    },
  }),
  archived_at: dateTime({ system: true, in: ['show'], texts: { label: 'Archived at', doc: { summary: 'When the policy was archived.' } } }),
  archived_by: f.relation({
    to: USER_RESOURCE,
    system: true,
    nullable: true,
    in: ['show'],
    open: 'none',
    texts: { label: 'Archived by', doc: { summary: 'The member who archived the policy.' } },
  }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};

/** The columns of a policies list. */
export const POLICY_COLUMNS = ['code', 'name', 'current_version_id', 'is_archived'] as const;
