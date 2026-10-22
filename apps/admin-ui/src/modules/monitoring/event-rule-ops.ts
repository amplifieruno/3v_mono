import { defineMutation } from '@burojs/core';
import { z } from 'zod';
import { MONITORING_BINDING } from '../../blocks/occupancy-now/occupancy-query';
import { type HasuraOperationEntry, hasuraOperation, rootOf } from '../../data/operations';
import { EVENT_RULE_RESOURCE, EVENT_RULE_VERSION_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { sqlRefusals } from '../../data/sql-refusals';

const NOTHING = ' Nothing was changed.';

/**
 * What `create_event_rule_draft` raises (`itap.create_draft_version`): the rule is gone. It never
 * refuses for an open draft: it answers the existing one (one open version per rule, unique index
 * `event_rule_versions_one_open_key`).
 */
export const CREATE_DRAFT_REFUSALS = {
  event_rule_not_found: 'The rule no longer exists.' + NOTHING,
  version_parent_not_found: 'The rule no longer exists.' + NOTHING,
};

/** What `publish_event_rule_version` raises (`itap.publish_version`). */
export const PUBLISH_REFUSALS = {
  event_rule_version_not_found: 'The version no longer exists (a discarded draft?): reload the rule.' + NOTHING,
  version_not_found: 'The version no longer exists (a discarded draft?): reload the rule.' + NOTHING,
  version_already_published:
    'This version is already the one in force: someone published it in the meantime. Reload the rule; to change it, edit the draft.' +
    NOTHING,
};

export const ruleIdInput = z.object({ ruleId: z.string().uuid() });
export const versionIdInput = z.object({ versionId: z.string().uuid() });

/** A version as the functions return it. */
export const changedVersion = z.object({ id: z.string(), rule_id: z.string(), version: z.number(), status: z.string() });

function versionOperation(
  operation: string,
  field: string,
  document: string,
  variables: (input: unknown) => Readonly<Record<string, unknown>>,
  refusals: Parameters<typeof sqlRefusals>[0],
): HasuraOperationEntry {
  return hasuraOperation(
    MONITORING_BINDING,
    operation,
    {
      kind: 'mutation',
      document,
      variables,
      mapResult: (data) => {
        const rows = rootOf(data, field);
        return Array.isArray(rows) ? (rows[0] ?? null) : null;
      },
    },
    sqlRefusals(refusals),
  );
}

/** `create_event_rule_draft(hasura_session, p_rule)`: the rule's open draft, copied from the version in force when there is none. */
export const createEventRuleDraftOperation = versionOperation(
  'createEventRuleDraft',
  'create_event_rule_draft',
  `mutation CreateEventRuleDraft($rule: uuid!) {
  create_event_rule_draft(args: { p_rule: $rule }) { id rule_id version status }
}`,
  (input) => ({ rule: (input as z.infer<typeof ruleIdInput>).ruleId }),
  CREATE_DRAFT_REFUSALS,
);

/** `publish_event_rule_version(hasura_session, p_version)`: the version is put in force, the previous one superseded. */
export const publishEventRuleVersionOperation = versionOperation(
  'publishEventRuleVersion',
  'publish_event_rule_version',
  `mutation PublishEventRuleVersion($version: uuid!) {
  publish_event_rule_version(args: { p_version: $version }) { id rule_id version status }
}`,
  (input) => ({ version: (input as z.infer<typeof versionIdInput>).versionId }),
  PUBLISH_REFUSALS,
);

const effects = [{ resource: EVENT_RULE_RESOURCE }, { resource: EVENT_RULE_VERSION_RESOURCE }];

/** Opens the rule's draft version, creating it from the version in force when there is none (idempotent). */
export const createEventRuleDraft = defineMutation('itap:create-event-rule-draft', {
  binding: createEventRuleDraftOperation.binding,
  input: schema(ruleIdInput),
  output: schema(changedVersion.nullable()),
  effects,
});

/** Publishes a version (a draft, or an earlier version to roll back to). */
export const publishEventRuleVersion = defineMutation('itap:publish-event-rule-version', {
  binding: publishEventRuleVersionOperation.binding,
  input: schema(versionIdInput),
  output: schema(changedVersion.nullable()),
  effects,
});
