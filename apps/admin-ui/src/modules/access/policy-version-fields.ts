import { f } from '@burojs/field-types';
import { ACCESS_POLICY_RESOURCE, USER_RESOURCE } from '../../data/resource-names';
import {
  ACCESS_EFFECTS,
  ACCESS_EFFECT_ENUM,
  ACCESS_POLICY_VERSION_STATUSES,
  ACCESS_POLICY_VERSION_STATUS_ENUM,
} from '../../enums/access';
import { enumField } from '../../enums/field';
import { boundedNumber, rangeValidator } from '../../fields/bounded-number';
import { dateTime } from '../../fields/date-time';
import { timeWindows } from '../../fields/time-windows';

/** `access_policy_versions_priority_range`. */
export const PRIORITY_RANGE = { min: 0, max: 1000, integer: true } as const;
/** `access_policy_versions_max_risk_range` (numeric(4,3)). */
export const MAX_RISK_RANGE = { min: 0, max: 1 } as const;

const member = (label: string, summary: string) =>
  f.relation({ to: USER_RESOURCE, system: true, nullable: true, in: ['list', 'show'], open: 'none', texts: { label, doc: { summary } } });

const stamp = (label: string, summary: string) => dateTime({ system: true, in: ['list', 'show'], texts: { label, doc: { summary } } });

/**
 * Columns of `itap.access_policy_versions` the `org_admin` role reads. Effect, priority, schedule,
 * validity and maximum risk are edited on a draft only; status and the approval columns change
 * only through submit, approve and reject (`itap.access_approval_context`). A version is created
 * by "Draft a change" or "Roll back to this version" only.
 */
export const accessPolicyVersionFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  policy_id: f.relation({
    to: ACCESS_POLICY_RESOURCE,
    system: true,
    open: 'page',
    providerOptions: { relationship: 'policy' },
    texts: { label: 'Policy', doc: { summary: 'The access policy this is a version of.' } },
  }),
  version: f.number({
    system: true,
    texts: { label: 'Version', doc: { summary: 'The version’s number within its policy: 1, 2, 3 in the order they were drafted.' } },
  }),
  status: enumField(ACCESS_POLICY_VERSION_STATUSES, ACCESS_POLICY_VERSION_STATUS_ENUM, {
    system: true,
    texts: {
      label: 'Status',
      doc: {
        summary:
          'Draft while edited; pending approval once submitted (frozen); published when approved by another member and in force; superseded once a later version was approved.',
      },
    },
  }),
  effect: enumField(ACCESS_EFFECTS, ACCESS_EFFECT_ENUM, {
    required: true,
    default: 'allow',
    texts: {
      label: 'Effect',
      doc: {
        summary:
          'Allow lets the people it names through the doors it names; deny refuses them. At equal priority a deny wins over an allow.',
      },
    },
  }),
  priority: boundedNumber({
    ...PRIORITY_RANGE,
    texts: {
      label: 'Priority',
      doc: {
        summary:
          'From 0 to 1000 (100 by default): where several policies match a person at a door, the highest priority decides; at equal priority a deny comes first.',
      },
    },
  }),
  schedule: timeWindows({
    emptyText: 'Always',
    nullable: true,
    texts: {
      label: 'Schedule',
      doc: {
        summary:
          'Weekly hours, in the time zone of the door’s facility, when the policy applies, such as weekdays 06:00–22:00. No windows = always.',
      },
    },
  }),
  valid_from: dateTime({
    texts: { label: 'Valid from', doc: { summary: 'Before this moment the policy does not apply; empty = from approval on.' } },
  }),
  valid_until: dateTime({
    texts: { label: 'Valid until', doc: { summary: 'From this moment on the policy no longer applies; empty = no end. After Valid from.' } },
  }),
  max_risk: f.number({
    nullable: true,
    min: MAX_RISK_RANGE.min,
    max: MAX_RISK_RANGE.max,
    validate: rangeValidator(MAX_RISK_RANGE),
    in: ['list', 'show', 'edit'],
    texts: {
      label: 'Maximum risk',
      doc: {
        summary:
          'An allow only: above this risk score (0 to 1, from crowding, recent denials, device health and unknown faces) the door refuses instead (Risk too high). Empty = no limit.',
      },
    },
  }),
  submitted_by: member('Submitted by', 'The member who submitted the version for approval; they cannot approve it themselves.'),
  submitted_at: stamp('Submitted', 'When the version was submitted for approval.'),
  approved_by: member('Approved by', 'The second member who approved the version and put it in force.'),
  approved_at: stamp('Approved', 'When the version was approved.'),
  rejection_reason: f.text({
    system: true,
    nullable: true,
    in: ['show'],
    texts: {
      label: 'Rejection reason',
      doc: {
        summary:
          'Why the last submission was rejected (“policy_archived” when the policy was archived while it waited); the version went back to draft.',
      },
    },
  }),
  rejected_by: member('Rejected by', 'The member who sent the version back to draft.'),
  rejected_at: stamp('Rejected', 'When the version was sent back to draft.'),
  published_at: stamp('Published', 'When the version was put in force; empty until it is approved.'),
  created_at: f.dateTime({ system: true, texts: 'Drafted', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};

/** The columns of a policy's version history. */
export const POLICY_VERSION_COLUMNS = ['version', 'status', 'effect', 'priority', 'submitted_by', 'approved_by', 'published_at'] as const;
