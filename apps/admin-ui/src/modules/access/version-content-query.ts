import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import {
  ACCESS_POLICY_ACCESS_LEVEL_SUBJECT_RESOURCE,
  ACCESS_POLICY_ACCESS_POINT_TARGET_RESOURCE,
  ACCESS_POLICY_AREA_TARGET_RESOURCE,
  ACCESS_POLICY_FACILITY_TARGET_RESOURCE,
  ACCESS_POLICY_PROFILE_SUBJECT_RESOURCE,
  ACCESS_POLICY_PROFILE_TYPE_SUBJECT_RESOURCE,
  ACCESS_POLICY_SEGMENT_SUBJECT_RESOURCE,
  ACCESS_POLICY_SUBJECT_RESOURCE,
  ACCESS_POLICY_TARGET_RESOURCE,
  ACCESS_POLICY_VERSION_RESOURCE,
} from '../../data/resource-names';
import { schema } from '../../data/schema';
import { ACCESS_BINDING } from './policy-ops';

const named = z.object({ name: z.string() }).nullable();
const person = z.object({ code: z.string().nullable(), first_name: z.string().nullable(), last_name: z.string().nullable() }).nullable();

/** One subject row with the names of what it points at. */
export const contentSubject = z.object({
  profile: person,
  segment: named,
  profile_type: z.string().nullable(),
  access_level: z.string().nullable(),
});

/** One target row with the names of what it points at. */
export const contentTarget = z.object({ facility: named, area: named, access_point: named });

/** A version as the approval review reads it: its settings and who and where it names. */
export const versionContent = z.object({
  version: z.number(),
  status: z.string(),
  effect: z.string(),
  priority: z.number(),
  schedule: z.unknown().nullable(),
  valid_from: z.string().nullable(),
  valid_until: z.string().nullable(),
  max_risk: z.number().nullable(),
  policy: z.object({ code: z.string(), name: z.string() }).nullable(),
  access_policy_version_subjects: z.array(contentSubject),
  access_policy_version_targets: z.array(contentTarget),
});

export type VersionContent = z.infer<typeof versionContent>;
export type ContentSubject = z.infer<typeof contentSubject>;
export type ContentTarget = z.infer<typeof contentTarget>;

const contentInput = z.object({ versionId: z.string().uuid() });

export const versionContentOperation = hasuraOperation(ACCESS_BINDING, 'versionContent', {
  kind: 'query',
  document: `query AccessPolicyVersionContent($id: uuid!) {
  access_policy_versions_by_pk(id: $id) {
    version
    status
    effect
    priority
    schedule
    valid_from
    valid_until
    max_risk
    policy { code name }
    access_policy_version_subjects(order_by: { created_at: asc }) {
      profile { code first_name last_name }
      segment { name }
      profile_type
      access_level
    }
    access_policy_version_targets(order_by: { created_at: asc }) {
      facility { name }
      area { name }
      access_point { name }
    }
  }
}`,
  variables: (input) => ({ id: (input as z.infer<typeof contentInput>).versionId }),
  mapResult: (data) => {
    const row = versionContent.safeParse(rootOf(data, 'access_policy_versions_by_pk'));
    return row.success ? row.data : null;
  },
});

/**
 * What a version says, in one read: effect, priority, schedule, validity, maximum risk, and every
 * subject (who) and target (where) by name. Shown before submitting and before approving, so the
 * approver sees exactly what goes in force.
 */
export const accessPolicyVersionContent = defineQuery('itap:access-policy-version-content', {
  binding: versionContentOperation.binding,
  input: schema(contentInput),
  output: schema(versionContent.nullable()),
  // The twins too: adding a subject or a target writes through them, and the review must show it.
  reads: [
    ACCESS_POLICY_VERSION_RESOURCE,
    ACCESS_POLICY_SUBJECT_RESOURCE,
    ACCESS_POLICY_PROFILE_SUBJECT_RESOURCE,
    ACCESS_POLICY_SEGMENT_SUBJECT_RESOURCE,
    ACCESS_POLICY_PROFILE_TYPE_SUBJECT_RESOURCE,
    ACCESS_POLICY_ACCESS_LEVEL_SUBJECT_RESOURCE,
    ACCESS_POLICY_TARGET_RESOURCE,
    ACCESS_POLICY_FACILITY_TARGET_RESOURCE,
    ACCESS_POLICY_AREA_TARGET_RESOURCE,
    ACCESS_POLICY_ACCESS_POINT_TARGET_RESOURCE,
  ].map(resourceByName),
});
