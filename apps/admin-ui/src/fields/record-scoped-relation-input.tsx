import { RecordScopeProvider, type ScalarInputProps } from '@burojs/react';
import { shadcnFieldImplementations } from '@burojs/ui-shadcn';
import type * as React from 'react';

type Meta = Readonly<Record<string, unknown>>;

const relation = shadcnFieldImplementations.relation;

/** The kit's relation select, inside the record scope its meta names. */
export function RecordScopedRelationInput(
  props: ScalarInputProps<unknown, Meta>,
): React.ReactElement | null {
  const Input = relation.Input;
  if (Input === undefined) return null;
  const { scopeResource, scopeField, scopeValue } = props.meta;
  return (
    <RecordScopeProvider
      resource={String(scopeResource)}
      values={{ [String(scopeField)]: scopeValue }}
    >
      <Input {...props} />
    </RecordScopeProvider>
  );
}
