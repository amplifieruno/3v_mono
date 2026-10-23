import type { FieldTexts } from '@burojs/core';
import { f } from '@burojs/field-types';

/** The field implementation id of {@link auditRecord} (`./audit-record-impl.ts`, display only). */
export const AUDIT_RECORD_FIELD = 'itap.audit-record';

export interface AuditRecordOptions {
  /** The row's column naming the audited table (`entity`). */
  readonly entityField: string;
  /** The row's column holding the action (`action`): a removed row has no page to open. */
  readonly actionField: string;
  /** The row's column holding what was recorded (`changes`), read for the record's name. */
  readonly changesField: string;
  readonly texts?: FieldTexts;
  readonly in?: readonly ('list' | 'show')[];
}

/**
 * An audit entry's `entity_id` shown as the audited record: its name (or code) when the entry holds
 * one, else the start of its id; a link to the record's page when the table has one in the console
 * (`../data/audit-entities.ts`) and the row was not removed, plain text otherwise. Never written.
 */
export function auditRecord(opts: AuditRecordOptions) {
  const base = f.uuid({
    system: true,
    nullable: true,
    ...(opts.in === undefined ? {} : { in: [...opts.in] }),
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
  });
  return {
    ...base,
    ui: { ...base.ui, display: AUDIT_RECORD_FIELD },
    meta: { entityField: opts.entityField, actionField: opts.actionField, changesField: opts.changesField },
  };
}
