import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { AUDIT_ENTRY_RESOURCE, USER_RESOURCE } from '../../data/resource-names';
import { AUDIT_ACTIONS, AUDIT_ACTION_ENUM, AUDIT_ENTITY_ENUM } from '../../enums/compliance-audit';
import { AUDIT_ENTITY_TABLES } from '../../data/audit-entities';
import { enumField } from '../../enums/field';
import { auditRecord } from '../../fields/audit-record';
import { dateTime } from '../../fields/date-time';
import { recordDate } from '../people/record-date';
import { auditDiffBlock } from './audit-diff-block';

/** Page size of the audit log. */
export const AUDIT_PAGE_SIZE = 50;

const showOnly = ['show'] as const;

/**
 * Columns of `itap.audit_log` the `org_admin` role reads: one row per change or sensitive act,
 * written by the database (row triggers) and the platform's functions, never by a member. Personal
 * rows of other members (their dashboards, saved searches, subscriptions…) are not visible.
 */
export const auditEntryFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  occurred_at: dateTime({ system: true, texts: { label: 'When', doc: { summary: 'When the change was committed.' } } }),
  action: enumField(AUDIT_ACTIONS, AUDIT_ACTION_ENUM, {
    system: true,
    texts: { label: 'Action', doc: { summary: 'What happened: a row created, changed or removed, or an act such as an export, a merge or an erasure.' } },
  }),
  entity: enumField(AUDIT_ENTITY_TABLES, AUDIT_ENTITY_ENUM, {
    system: true,
    nullable: true,
    texts: { label: 'Entity', doc: { summary: 'The kind of record it concerns (the table). A table the console does not know shows its raw name.' } },
  }),
  entity_id: auditRecord({
    entityField: 'entity',
    actionField: 'action',
    changesField: 'changes',
    texts: {
      label: 'Record',
      doc: { summary: 'The record it concerns, by name when the entry holds one; a link to its page when it has one and was not removed.' },
    },
  }),
  user_id: f.relation({
    to: USER_RESOURCE,
    system: true,
    nullable: true,
    open: 'none',
    texts: {
      label: 'By',
      doc: { summary: 'The member whose session made the change; empty for the platform’s own jobs (retention, syncs, the seed) and for former members.' },
    },
  }),
  reason: f.string({
    system: true,
    nullable: true,
    texts: { label: 'Reason', doc: { summary: 'Why, when the platform recorded one: the data subject request (dsr:DSR-…), the integration (integration:INT-…) or the reason a member typed.' } },
  }),
  changes: f.json({
    system: true,
    nullable: true,
    in: [],
    texts: { label: 'Changes', doc: { summary: 'What was recorded, shown under "What changed". Secrets are stored redacted.' } },
  }),
  ip: f.string({ system: true, nullable: true, in: [...showOnly], texts: { label: 'IP address', doc: { summary: 'The client address, when the platform recorded it.' } } }),
  user_agent: f.string({ system: true, nullable: true, in: [...showOnly], texts: { label: 'Client', doc: { summary: 'The browser or client, when the platform recorded it.' } } }),
};

/**
 * The audit log (`itap.audit_log`): who changed what and when, newest first. Read-only and
 * append-only (no create, edit or delete; the database refuses them too), keyset paging, no count on
 * every page. An entry's page shows what changed, field by field.
 */
export const auditEntry = defineResource(AUDIT_ENTRY_RESOURCE, {
  texts: {
    label: 'Audit entry',
    labelPlural: 'Audit log',
    doc: {
      summary:
        'One recorded change or sensitive act: when, by whom, on which record, and what changed (before and after). Written by the platform, never changed or deleted by a member.',
    },
  },
  basePath: '/audit-log',
  section: NAV_SECTIONS.compliance,
  order: 80,
  icon: NAV_ICONS.auditLog,
  displayField: 'occurred_at',
  recordTitle: (record) => recordDate('Audit entry of', record.occurred_at),
  data: { provider: 'hasura' },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: auditEntryFields,
  views: {
    list: {
      columns: ['occurred_at', 'action', 'entity', 'entity_id', 'user_id', 'reason'],
      defaultSort: [{ field: 'occurred_at', direction: 'desc' }],
      sortTiebreaker: 'id',
      pagination: 'cursor',
      count: 'manual',
      pageSize: AUDIT_PAGE_SIZE,
      filters: { pinned: ['entity', 'action', 'user_id', 'occurred_at'], fields: ['entity', 'action', 'user_id', 'occurred_at', 'entity_id'] },
      savedViews: [
        { id: 'removed', texts: 'Removed rows', state: { filters: [{ field: 'action', op: 'eq', value: 'delete' }] } },
        { id: 'sensitive', texts: 'Sensitive data viewed', state: { filters: [{ field: 'action', op: 'eq', value: 'view_sensitive' }] } },
        { id: 'exports', texts: 'Exports', state: { filters: [{ field: 'action', op: 'eq', value: 'export' }] } },
      ],
    },
    show: {
      header: (l) => [l.grid(['occurred_at', 'action', 'entity', 'entity_id']), l.grid(['user_id', 'reason'])],
      body: (l) => [
        l.panel([l.place(auditDiffBlock, { key: 'diff', props: { auditAction: l.ref('record', 'action'), changes: l.ref('record', 'changes') } })], {
          key: 'changes',
          texts: { title: 'What changed' },
        }),
        l.grid(['ip', 'user_agent']),
      ],
    },
  },
});
