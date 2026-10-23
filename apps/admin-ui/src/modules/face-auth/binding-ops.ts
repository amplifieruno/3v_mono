import { defineMutation } from '@burojs/core';
import { z } from 'zod';
import { type HasuraOperationEntry, hasuraOperation, rootOf } from '../../data/operations';
import { schema } from '../../data/schema';
import { type SqlRefusalText, sqlRefusals } from '../../data/sql-refusals';
import { FACE_AUTH_BINDING } from './application-ops';
import { BINDINGS, type BindingKind, type BindingSpec } from './binding-targets';

const NOTHING = ' Nothing was added.';

/** Why a sandbox application binds no facility or access point (`itap.sandbox_population_check`). */
export const SANDBOX_LOCATION_REFUSAL =
  'A sandbox application binds no facilities or access points: it authenticates only the synthetic test identities of its segment, never people at a place.' +
  NOTHING;

/**
 * What the database refuses on a new binding: the sandbox guard, the binding already there
 * (`<table>_key`), the application or the bound thing gone (composite foreign keys).
 */
export function bindingRefusals(spec: BindingSpec): Readonly<Record<string, SqlRefusalText>> {
  const thing = spec.label.toLowerCase();
  return {
    sandbox_location_binding: SANDBOX_LOCATION_REFUSAL,
    [`${spec.table}_key`]: `This ${thing} is already bound to the application.` + NOTHING,
    [`${spec.table}_application_fkey`]: 'The application no longer exists: reload the page.' + NOTHING,
    ...(spec.graphqlType === 'uuid'
      ? { [`${spec.table}_${spec.kind}_fkey`]: `The ${thing} no longer exists: choose another.` + NOTHING }
      : {}),
  };
}

export const bindInput = z.object({ applicationId: z.string().uuid(), value: z.string().min(1) });

/** The operation name of a kind's insert (`bindSegment`, `bindAccessPoint`, …). */
export function bindOperationName(kind: BindingKind): string {
  return `bind${kind.replace(/(^|_)([a-z])/gu, (_m, _s: string, c: string) => c.toUpperCase())}`;
}

function bindOperation(spec: BindingSpec): HasuraOperationEntry {
  const root = `insert_${spec.table}_one`;
  return hasuraOperation(
    FACE_AUTH_BINDING,
    bindOperationName(spec.kind),
    {
      kind: 'mutation',
      document: `mutation ${bindOperationName(spec.kind).replace(/^b/u, 'B')}($application: uuid!, $value: ${spec.graphqlType}!) {
  ${root}(object: { application_id: $application, ${spec.column}: $value }) { id }
}`,
      variables: (input) => {
        const { applicationId, value } = input as z.infer<typeof bindInput>;
        return { application: applicationId, value };
      },
      mapResult: (data) => rootOf(data, root) ?? null,
    },
    sqlRefusals(bindingRefusals(spec), `The binding was refused: {{detail}}.${NOTHING}`),
  );
}

/** One insert per kind of binding, in the order of {@link BINDINGS}. */
export const BIND_OPERATIONS = BINDINGS.map(bindOperation);

function bindMutation(spec: BindingSpec, operation: HasuraOperationEntry) {
  return defineMutation(`itap:bind-client-application-${spec.kind.replace('_', '-')}`, {
    binding: operation.binding,
    input: schema(bindInput),
    output: schema(z.object({ id: z.string() }).nullable()),
    effects: [{ resource: spec.resource }],
  });
}

/** The add mutation of each kind, by kind. */
export const BIND_MUTATIONS = Object.fromEntries(
  BINDINGS.map((spec, index) => [spec.kind, bindMutation(spec, BIND_OPERATIONS[index] as HasuraOperationEntry)]),
) as Readonly<Record<BindingKind, ReturnType<typeof bindMutation>>>;
