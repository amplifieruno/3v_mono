import { fieldImplementation } from '@burojs/react';
import { z } from 'zod';
import { AUDIT_RECORD_FIELD } from './audit-record';
import { AuditRecordDisplay } from './audit-record-display';

/** The `itap.audit-record` display (the column is never written), for `composeFieldImplementations`. */
export const auditRecordImplementations = {
  [AUDIT_RECORD_FIELD]: fieldImplementation({
    meta: z.object({ entityField: z.string(), actionField: z.string(), changesField: z.string() }),
    Display: AuditRecordDisplay,
  }),
};
