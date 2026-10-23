import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import {
  ACCESS_DECISION_RESOURCE,
  ACCESS_POINT_RESOURCE,
  ACCESS_POLICY_VERSION_RESOURCE,
  AREA_RESOURCE,
  IDENTITY_RESOURCE,
  PROFILE_RESOURCE,
} from '../../data/resource-names';
import { schema } from '../../data/schema';
import { ACCESS_BINDING } from './policy-ops';

const person = z.object({ code: z.string().nullable(), first_name: z.string().nullable(), last_name: z.string().nullable() }).nullable();

/** A decision as the trace block reads it: its outcome, what it links to by name, and the trace. */
export const decisionTrace = z.object({
  id: z.string(),
  result: z.string(),
  reason: z.string(),
  risk_score: z.number().nullable(),
  decided_at: z.string(),
  signals: z.unknown(),
  access_point_id: z.string().nullable(),
  profile_id: z.string().nullable(),
  identity_id: z.string().nullable(),
  policy_version_id: z.string().nullable(),
  grant_id: z.string().nullable(),
  override_id: z.string().nullable(),
  access_point: z.object({ name: z.string() }).nullable(),
  profile: person,
  identity: z.object({ code: z.string() }).nullable(),
});

export type DecisionTrace = z.infer<typeof decisionTrace>;

const traceInput = z.object({ decisionId: z.string().uuid() });

export const decisionTraceOperation = hasuraOperation(ACCESS_BINDING, 'decisionTrace', {
  kind: 'query',
  document: `query AccessDecisionTrace($id: uuid!) {
  access_decisions_by_pk(id: $id) {
    id result reason risk_score decided_at signals
    access_point_id profile_id identity_id policy_version_id grant_id override_id
    access_point { name }
    profile { code first_name last_name }
    identity { code }
  }
}`,
  variables: (input) => ({ id: (input as z.infer<typeof traceInput>).decisionId }),
  mapResult: (data) => {
    const row = decisionTrace.safeParse(rootOf(data, 'access_decisions_by_pk'));
    return row.success ? row.data : null;
  },
});

/** One decision with its trace (`signals`), read fresh; `null` when it is not visible. */
export const accessDecisionTrace = defineQuery('itap:access-decision-trace', {
  binding: decisionTraceOperation.binding,
  input: schema(traceInput),
  output: schema(decisionTrace.nullable()),
  reads: [ACCESS_DECISION_RESOURCE, ACCESS_POINT_RESOURCE, PROFILE_RESOURCE, IDENTITY_RESOURCE].map(resourceByName),
});

const namesInput = z.object({ versionIds: z.array(z.string().uuid()), areaIds: z.array(z.string().uuid()) });

/** The policy versions and areas a trace names, by id. */
export const traceNames = z.object({
  versions: z.record(z.string(), z.string()),
  areas: z.record(z.string(), z.string()),
});

export type TraceNames = z.infer<typeof traceNames>;

const versionRow = z.object({ id: z.string(), version: z.number(), policy: z.object({ code: z.string(), name: z.string() }).nullable() });
const areaRow = z.object({ id: z.string(), name: z.string() });

/** `POL-00007 Lab access, version 3`; `Version 3` when the policy is not visible. */
export function versionName(row: z.infer<typeof versionRow>): string {
  return row.policy === null ? `Version ${row.version}` : `${row.policy.code} ${row.policy.name}, version ${row.version}`;
}

export const traceNamesOperation = hasuraOperation(ACCESS_BINDING, 'traceNames', {
  kind: 'query',
  document: `query AccessTraceNames($versions: [uuid!]!, $areas: [uuid!]!) {
  access_policy_versions(where: { id: { _in: $versions } }) { id version policy { code name } }
  areas(where: { id: { _in: $areas } }) { id name }
}`,
  variables: (input) => {
    const { versionIds, areaIds } = input as z.infer<typeof namesInput>;
    return { versions: versionIds, areas: areaIds };
  },
  mapResult: (data) => {
    const versions = z.array(versionRow).safeParse(rootOf(data, 'access_policy_versions'));
    const areas = z.array(areaRow).safeParse(rootOf(data, 'areas'));
    return {
      versions: Object.fromEntries((versions.success ? versions.data : []).map((row) => [row.id, versionName(row)])),
      areas: Object.fromEntries((areas.success ? areas.data : []).map((row) => [row.id, row.name])),
    };
  },
});

/** The names of the policy versions a trace evaluated and of the areas it found crowded. */
export const accessTraceNames = defineQuery('itap:access-trace-names', {
  binding: traceNamesOperation.binding,
  input: schema(namesInput),
  output: schema(traceNames),
  reads: [ACCESS_POLICY_VERSION_RESOURCE, AREA_RESOURCE].map(resourceByName),
});
