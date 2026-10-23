import { defineEnum } from '@burojs/core';
import { AUDIT_ENTITIES, AUDIT_ENTITY_TABLES } from '../data/audit-entities';
import { enumValues } from './values';

/*
 * The audit log (slice 10): the action is the Hasura enum table `audit_actions`; the entity is the
 * audited table's name (free text in the database), offered as a console-only enum of the tables
 * the console knows (`../data/audit-entities.ts`). A value outside either list shows raw.
 */

export const AUDIT_ACTION_ENUM = 'audit_action';
export const AUDIT_ENTITY_ENUM = 'audit_entity';

export const AUDIT_ACTIONS = [
  'insert',
  'update',
  'delete',
  'switch_org',
  'export',
  'view_sensitive',
  'merge',
  'rollback',
  'approve',
  'reject',
  'publish',
  'restrict',
  'unrestrict',
  'erase',
  'rectify',
] as const;

const text = (label: string, summary: string) => ({ label, doc: { summary } });

export const auditActionEnum = defineEnum({
  name: AUDIT_ACTION_ENUM,
  values: enumValues(AUDIT_ACTIONS, {
    insert: 'success',
    update: 'info',
    delete: 'destructive',
    switch_org: 'secondary',
    export: 'warning',
    view_sensitive: 'warning',
    merge: 'secondary',
    rollback: 'secondary',
    approve: 'success',
    reject: 'destructive',
    publish: 'info',
    restrict: 'warning',
    unrestrict: 'secondary',
    erase: 'destructive',
    rectify: 'secondary',
  }),
  texts: {
    insert: text('Created', 'A row was added; the entry holds the new row (secrets redacted).'),
    update: text('Changed', 'Columns of a row changed; the entry holds each changed column before and after.'),
    delete: text('Removed', 'A row was deleted; the entry holds the row as it was (secrets redacted).'),
    switch_org: text('Switched organization', 'A member signed in to this organization (an organization token was issued).'),
    export: text('Exported', 'Data left the platform: an export file was written.'),
    view_sensitive: text('Viewed sensitive data', 'A sensitive file (a document, a face photo, an export) was opened.'),
    merge: text('Merged', 'Identities or profiles were merged; the entry lists what moved.'),
    rollback: text('Rolled back', 'A merge was undone.'),
    approve: text('Approved', 'A request (an access policy version, a verification) was approved.'),
    reject: text('Rejected', 'A request was rejected.'),
    publish: text('Published', 'A version (an event rule, an access policy) was published.'),
    restrict: text('Restricted', 'Processing of a person was restricted (GDPR Art. 18).'),
    unrestrict: text('Restriction lifted', 'A restriction of processing was lifted.'),
    erase: text('Erased', 'A person’s personal data was erased by a data subject request.'),
    rectify: text('Rectified', 'A rectification request was closed.'),
  },
});

export const auditEntityEnum = defineEnum({
  name: AUDIT_ENTITY_ENUM,
  values: AUDIT_ENTITY_TABLES.map((value) => ({ value, color: 'outline' as const })),
  texts: Object.fromEntries(
    AUDIT_ENTITY_TABLES.map((table) => [table, text(AUDIT_ENTITIES[table][0], `Rows of the table ${table}.`)]),
  ),
});

export const AUDIT_ENUMS = [auditActionEnum, auditEntityEnum] as const;

/** `audit_entity` has no Hasura enum table (the column is free text). */
export const AUDIT_CONSOLE_ONLY_ENUMS = [AUDIT_ENTITY_ENUM] as const;

export const AUDIT_ENUM_TABLES: Readonly<Record<string, string>> = {
  [AUDIT_ACTION_ENUM]: 'audit_actions',
};
