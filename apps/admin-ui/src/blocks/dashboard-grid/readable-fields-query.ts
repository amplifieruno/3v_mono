import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { schema } from '../../data/schema';
import { ANALYTICS_BINDING } from '../facility-period/analytics-binding';

const rootFields = z.object({ fields: z.array(z.object({ name: z.string() })) });

/**
 * The query root fields the signed-in role may read (Hasura answers the introspection of
 * `query_root` per role): a dashboard widget whose `query` is not among them shows a "no access"
 * tile instead of a failing read. `null` when the answer cannot be read (every widget then runs and
 * fails on its own).
 */
export const readableFieldsOperation = hasuraOperation(ANALYTICS_BINDING, 'readableRootFields', {
  kind: 'query',
  document: `query ReadableRootFields {
  __type(name: "query_root") {
    fields {
      name
    }
  }
}`,
  variables: () => undefined,
  mapResult: (data) => {
    const read = rootFields.safeParse(rootOf(data, '__type'));
    return read.success ? read.data.fields.map((field) => field.name) : null;
  },
});

/** The root fields the session may read (`itap:readable-root-fields`), for the dashboard tiles. */
export const readableRootFields = defineQuery('itap:readable-root-fields', {
  binding: readableFieldsOperation.binding,
  input: schema(z.object({})),
  output: schema(z.array(z.string()).nullable()),
});
