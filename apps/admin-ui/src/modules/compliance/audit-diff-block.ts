import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';

/**
 * What an audit entry recorded (`itap:audit-diff`), on the entry's page: for a change, each
 * changed column (or key of a JSON column) with its value before and after; for a created or
 * removed row, its columns; for a purge, that the row's values were not kept; for any other action,
 * the details the platform wrote. Secrets read "Redacted", never their value. Props: the entry's
 * action (`auditAction`) and changes.
 */
export const auditDiffBlock = defineBlock('itap:audit-diff', {
  texts: {
    label: 'What changed',
    field: 'Field',
    before: 'Before',
    after: 'After',
    value: 'Value',
    empty: 'empty',
    redacted: 'Redacted',
    redactedHint: 'A secret: the audit log never keeps its value.',
    none: 'Nothing else was recorded for this entry.',
    retention:
      'The row was purged by retention or erased by a data subject request. Its values are not kept in the audit log, only that it happened.',
    changes: '{{count}} changed',
    created: 'The row as it was created:',
    removed: 'The row as it was removed:',
    details: 'What the platform recorded:',
  },
  props: {
    auditAction: prop(z.string().nullable().optional()).default(null),
    changes: prop(z.unknown()).default(null),
  },
});
