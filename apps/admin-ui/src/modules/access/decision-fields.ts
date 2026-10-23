import { f } from '@burojs/field-types';
import {
  ACCESS_GRANT_RESOURCE,
  ACCESS_POINT_RESOURCE,
  ACCESS_POLICY_VERSION_RESOURCE,
  DETECTION_RESOURCE,
  DEVICE_RESOURCE,
  EMERGENCY_OVERRIDE_RESOURCE,
  FACILITY_RESOURCE,
  IDENTITY_RESOURCE,
  PROFILE_RESOURCE,
} from '../../data/resource-names';
import { ACCESS_DECISION_REASONS, ACCESS_DECISION_REASON_ENUM, ACCESS_DECISION_RESULTS, ACCESS_DECISION_RESULT_ENUM } from '../../enums/access';
import { enumField } from '../../enums/field';
import { dateTime } from '../../fields/date-time';

const link = (to: string, label: string, summary: string) =>
  f.relation({ to, system: true, nullable: true, open: 'page', texts: { label, doc: { summary } } });

/**
 * Columns of `itap.access_decisions` the `org_admin` role reads: an append-only log written by
 * the access engine only (terminals, face-credential doors, "Test access"). `signals` (the
 * engine's whole trace) is not selected here: the decision trace block reads and shows it as steps.
 */
export const accessDecisionFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  decided_at: dateTime({ system: true, texts: { label: 'Decided', doc: { summary: 'The moment the door asked and the engine answered.' } } }),
  result: enumField(ACCESS_DECISION_RESULTS, ACCESS_DECISION_RESULT_ENUM, {
    system: true,
    texts: { label: 'Result', doc: { summary: 'Whether the door let the person through.' } },
  }),
  reason: enumField(ACCESS_DECISION_REASONS, ACCESS_DECISION_REASON_ENUM, {
    system: true,
    texts: {
      label: 'Reason',
      doc: { summary: 'The step of the evaluation that decided: an override, the door’s state, the person, a policy, a grant, or nothing matching.' },
    },
  }),
  facility_id: link(FACILITY_RESOURCE, 'Facility', 'The site of the access point.'),
  access_point_id: link(ACCESS_POINT_RESOURCE, 'Access point', 'The door, turnstile or gate that asked.'),
  device_id: link(DEVICE_RESOURCE, 'Device', 'The terminal or camera that presented the person; empty when none was given.'),
  profile_id: link(PROFILE_RESOURCE, 'Person', 'The person decided about; empty for an unknown face.'),
  identity_id: link(IDENTITY_RESOURCE, 'Face', 'The recognised identity (face) presented at the door, when the person was recognised by face.'),
  policy_version_id: link(
    ACCESS_POLICY_VERSION_RESOURCE,
    'Policy version',
    'The policy version that decided, when a policy decided (allowed, denied, or refused for too high a risk).',
  ),
  grant_id: link(ACCESS_GRANT_RESOURCE, 'Grant', 'The access grant that let the person through, when a grant decided.'),
  override_id: link(EMERGENCY_OVERRIDE_RESOURCE, 'Emergency override', 'The emergency override that decided, when one covered the door.'),
  risk_score: f.number({
    system: true,
    nullable: true,
    texts: {
      label: 'Risk',
      doc: {
        summary:
          'From 0 to 1: crowding over capacity, the person’s recent denials, the health of the door’s device and an unknown face add up. An allow with a maximum risk refuses above it.',
      },
    },
  }),
  detection_id: link(DETECTION_RESOURCE, 'Detection', 'The face detection that asked, at a face-credential door.'),
  epoch: f.number({
    system: true,
    in: ['show'],
    texts: { label: 'Policy epoch', doc: { summary: 'The version of the organization’s rule set the engine decided with (it grows with every change).' } },
  }),
  latency_ms: f.number({
    system: true,
    nullable: true,
    in: ['show'],
    texts: { label: 'Latency (ms)', doc: { summary: 'How long the engine took to decide, in milliseconds.' } },
  }),
};

/** The columns of a decision list placed on another record's page. */
export const DECISION_RELATED_COLUMNS = ['decided_at', 'result', 'reason', 'profile_id', 'access_point_id', 'risk_score'] as const;
