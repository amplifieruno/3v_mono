import { type FlowConfig, type FlowUnknownCheck, cond, ref } from '@burojs/core';
import { NAV_ICONS } from '../../app/nav';
import { EVENT_RULE_VERSION_RESOURCE } from '../../data/resource-names';
import { resourceByName } from '../../data/resource-by-name';
import { fieldApplied } from '../../data/status-applied';
import { createEventRuleDraft, publishEventRuleVersion } from './event-rule-ops';

/** A version can be edited, its scope changed and it can be published while it is open. */
export const OPEN_STATUSES = ['draft', 'pending_approval'] as const;

export const VERSION_OPEN = cond.in(ref('record', 'status'), [...OPEN_STATUSES]);
export const VERSION_SUPERSEDED = cond.equals(ref('record', 'status'), 'superseded');

/** Check again for "Edit draft": the rule has an open version now (the function is idempotent). */
export const draftExists: FlowUnknownCheck = async ({ record, data }) => {
  const ruleId = record?.id;
  if (typeof ruleId !== 'string' || ruleId === '') return 'unknown';
  try {
    const { data: rows } = await data.list(resourceByName(EVENT_RULE_VERSION_RESOURCE) as never, {
      filter: {
        and: [
          { field: 'rule_id', op: 'eq', value: ruleId },
          { field: 'status', op: 'in', value: [...OPEN_STATUSES] },
        ],
      },
      pagination: { kind: 'offset', page: 1, pageSize: 1 },
    } as never);
    return (rows as readonly unknown[]).length > 0 ? 'applied' : 'not-applied';
  } catch {
    return 'unknown';
  }
};

/**
 * "Edit draft" on a rule: `create_event_rule_draft` answers the rule's open draft, or a new one
 * copied (with its scope) from the version in force, then the draft opens for editing. Editing a
 * rule's behaviour is always editing its draft: the version in force never changes in place.
 */
export const editDraftFlow = {
  texts: {
    label: 'Edit draft',
    notify: 'Draft version {{version}} is open for editing.',
    doc: {
      summary:
        'Opens the rule’s draft version for editing, creating it from the version in force when there is none; the version in force keeps applying until the draft is published.',
    },
  },
  icon: NAV_ICONS.editDraft,
  surfaces: { default: 'menu', show: 'auto' },
  submit: {
    mutation: createEventRuleDraft,
    // Idempotent: a second call answers the same draft.
    retry: 'after-auth-refresh',
    input: { ruleId: ref('record', 'id') },
    onUnknown: { check: draftExists },
  },
  then: {
    notify: { params: { version: ref('result', 'version') } },
    open: { resource: EVENT_RULE_VERSION_RESOURCE, id: ref('result', 'id'), mode: 'edit' },
  },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;

/**
 * "Publish" on an open version: `publish_event_rule_version` puts it in force; the version in
 * force so far becomes superseded. Not offered on a published or superseded version; a version
 * someone published meanwhile is refused with the reason (`version_already_published`).
 */
export const publishFlow = {
  texts: {
    label: 'Publish',
    confirm:
      'Publish this version? Events are evaluated against it from now on; the version in force so far is superseded.',
    notify: 'Version published.',
    doc: {
      summary:
        'Puts the draft in force: events from now on are evaluated against its parameters, severity and scope. The previous version is kept as superseded.',
    },
  },
  icon: NAV_ICONS.publish,
  surfaces: { default: 'menu', show: 'auto' },
  when: VERSION_OPEN,
  confirm: true,
  submit: {
    mutation: publishEventRuleVersion,
    retry: 'never',
    input: { versionId: ref('record', 'id') },
    onUnknown: { check: fieldApplied(EVENT_RULE_VERSION_RESOURCE, 'status', 'published') },
  },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;

/** "Roll back to this version" on a superseded version: publishes it again (the same function). */
export const rollbackFlow = {
  texts: {
    label: 'Roll back to this version',
    confirm:
      'Put this earlier version back in force? The version in force now is superseded; an open draft stays as it is.',
    notify: 'Rolled back: this version is in force again.',
    doc: {
      summary:
        'Publishes an earlier version again, for example when a new version raised too many events; the version in force now is kept as superseded.',
    },
  },
  icon: NAV_ICONS.rollback,
  surfaces: { default: 'menu', show: 'menu' },
  when: VERSION_SUPERSEDED,
  confirm: true,
  submit: {
    mutation: publishEventRuleVersion,
    retry: 'never',
    input: { versionId: ref('record', 'id') },
    onUnknown: { check: fieldApplied(EVENT_RULE_VERSION_RESOURCE, 'status', 'published') },
  },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;
