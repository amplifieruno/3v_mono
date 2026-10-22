import type { StandardSchemaV1 } from '@burojs/core';
import { fieldImplementation } from '@burojs/react';
import { shadcnFieldImplementations } from '@burojs/ui-shadcn';
import { RECORD_SCOPED_RELATION_FIELD } from './record-scoped-relation';
import { RecordScopedRelationInput } from './record-scoped-relation-input';

type Meta = Readonly<Record<string, unknown>>;

const relation = shadcnFieldImplementations.relation;

/**
 * The relation meta (checked by the kit's relation schema) plus the frame of
 * `inRecordScope`: `scopeResource` and `scopeField` name it, `scopeValue` is read beside the form.
 */
const recordScopedMeta: StandardSchemaV1<unknown, Meta> = {
  '~standard': {
    version: 1,
    vendor: 'itap',
    validate(value: unknown) {
      const checked = relation.meta?.['~standard'].validate(value);
      if (checked instanceof Promise) return checked;
      if (checked?.issues) return checked;
      const meta = value as Meta;
      if (typeof meta.scopeResource !== 'string' || typeof meta.scopeField !== 'string') {
        return { issues: [{ message: 'needs scopeResource and scopeField', path: ['scopeResource'] }] };
      }
      return { value: meta };
    },
  },
};

/** The `itap.record-scoped-relation` input (the display is the kit's relation display). */
export const recordScopedRelationImplementations = {
  [RECORD_SCOPED_RELATION_FIELD]: fieldImplementation({
    meta: recordScopedMeta,
    Input: RecordScopedRelationInput,
    ...(relation.Display === undefined ? {} : { Display: relation.Display }),
  }),
};
