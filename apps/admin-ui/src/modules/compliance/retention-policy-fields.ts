import type { Check, ReadDataAccess } from '@burojs/core';
import { f } from '@burojs/field-types';
import { resourceByName } from '../../data/resource-by-name';
import { FACILITY_RESOURCE, RETENTION_POLICY_RESOURCE, USER_RESOURCE } from '../../data/resource-names';
import { RETENTION_ACTIONS, RETENTION_ACTION_ENUM, RETENTION_DATA_CLASSES, RETENTION_DATA_CLASS_ENUM } from '../../enums/compliance';
import { enumField } from '../../enums/field';
import { boundedNumber } from '../../fields/bounded-number';
import { MAX_RETAIN_DAYS, actionAllowed, belowFloor, classHasFacility } from './retention-classes';

const present = (value: unknown): boolean => value !== null && value !== undefined && value !== '';

/**
 * Columns of `itap.retention_policies` the `org_admin` role reads. The class and the facility
 * are chosen once (a policy is the rule of one scope); activation goes through "Activate" /
 * "Deactivate", so a second active policy of the same scope is refused with a sentence.
 */
export const retentionPolicyFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  data_class: enumField(RETENTION_DATA_CLASSES, RETENTION_DATA_CLASS_ENUM, {
    required: true,
    write: 'create',
    texts: {
      label: 'Data class',
      doc: { summary: 'What the policy purges: one kind of data, such as detections, events or the audit log. Chosen once.' },
    },
  }),
  facility_id: f.relation({
    to: FACILITY_RESOURCE,
    nullable: true,
    write: 'create',
    open: 'page',
    texts: {
      label: 'Facility',
      description: 'Empty: the whole organization.',
      doc: {
        summary:
          'Only for classes whose rows belong to one facility: the policy then applies there and beats the organization-wide one. Empty means the whole organization. Chosen once.',
      },
    },
  }),
  retain_days: boundedNumber({
    min: 1,
    max: MAX_RETAIN_DAYS,
    integer: true,
    texts: {
      label: 'Keep for (days)',
      doc: {
        summary:
          'How long rows are kept before the nightly run purges them, counted from their own time. The audit log and face authentication attempts are kept at least 365 days.',
      },
    },
  }),
  action: enumField(RETENTION_ACTIONS, RETENTION_ACTION_ENUM, {
    required: true,
    default: 'delete',
    texts: {
      label: 'Action',
      doc: { summary: 'What happens to rows past their time: deleted, anonymized (kept without people) or archived (kept without files).' },
    },
  }),
  is_active: f.boolean({
    default: true,
    write: 'create',
    texts: {
      label: 'Active',
      doc: { summary: 'Only active policies purge, and only one per class and facility. Changed with Activate or Deactivate.' },
    },
  }),
  description: f.text({
    nullable: true,
    texts: { label: 'Description', doc: { summary: 'Why this period, such as the legal basis or the contract that sets it.' } },
  }),
  created_by: f.relation({
    to: USER_RESOURCE,
    system: true,
    nullable: true,
    in: ['show'],
    open: 'none',
    texts: { label: 'Created by', doc: { summary: 'The member who created the policy.' } },
  }),
  created_at: f.dateTime({ system: true, in: ['list', 'show'], texts: { label: 'Created', doc: { summary: 'When the policy was created.' } } }),
  updated_at: f.dateTime({ system: true, in: ['show'], texts: { label: 'Updated', doc: { summary: 'When the policy last changed.' } } }),
};

/** Whether an active policy other than `exceptId` covers the class and facility (`null`: the whole organization). */
export async function activeScopeTaken(
  data: ReadDataAccess,
  dataClass: string,
  facilityId: string | null,
  exceptId: string | null,
): Promise<boolean> {
  const and: Record<string, unknown>[] = [
    { field: 'data_class', op: 'eq', value: dataClass },
    { field: 'is_active', op: 'eq', value: true },
    facilityId === null ? { field: 'facility_id', op: 'isNull' } : { field: 'facility_id', op: 'eq', value: facilityId },
  ];
  if (exceptId !== null) and.push({ field: 'id', op: 'neq', value: exceptId });
  try {
    const { data: rows } = await data.list(
      resourceByName(RETENTION_POLICY_RESOURCE) as never,
      { filter: { and }, pagination: { kind: 'offset', page: 1, pageSize: 1 } } as never,
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    // Unknown: the database still refuses a second active policy.
    return false;
  }
}

/** The form's checks, restating the class rules of the table (the server refuses the same). */
export const RETENTION_POLICY_CHECKS: Check[] = [
  {
    id: 'retentionFloor',
    on: ['create', 'edit'],
    severity: 'error',
    anchor: 'retain_days',
    texts: 'The audit log and face authentication attempts are kept at least 365 days.',
    when: ({ values, record }) => belowFloor(values.data_class ?? record?.data_class, values.retain_days),
  },
  {
    id: 'retentionActionAllowed',
    on: ['create', 'edit'],
    severity: 'error',
    anchor: 'action',
    texts: 'This class does not take that action. Delete is accepted by every class; Anonymize only by logs that stay useful without people, Archive only by reports and bulk jobs.',
    when: ({ values, record }) => {
      const dataClass = values.data_class ?? record?.data_class;
      return present(dataClass) && present(values.action) && !actionAllowed(dataClass, values.action);
    },
  },
  {
    id: 'retentionFacilityClass',
    on: ['create'],
    severity: 'error',
    anchor: 'data_class',
    texts: 'This class is purged for the whole organization only: clear the facility, or choose a class whose rows belong to a facility.',
    when: ({ values }) => present(values.facility_id) && present(values.data_class) && !classHasFacility(values.data_class),
  },
  {
    id: 'retentionActiveScope',
    on: ['create'],
    severity: 'error',
    anchor: 'data_class',
    texts: 'An active policy already covers this class for the same facility (or the whole organization). Deactivate it first, or create this one inactive.',
    when: async ({ values, data }) => {
      if (values.is_active === false || typeof values.data_class !== 'string') return false;
      const facility = typeof values.facility_id === 'string' && values.facility_id !== '' ? values.facility_id : null;
      return activeScopeTaken(data, values.data_class, facility, null);
    },
  },
];

