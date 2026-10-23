import type { FixedFilterInput } from '@burojs/core';
import { type ScalarInputProps, useOne } from '@burojs/react';
import { shadcnFieldImplementations } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { CLIENT_APPLICATION_RESOURCE } from '../data/resource-names';

type Meta = Readonly<Record<string, unknown>>;

const relation = shadcnFieldImplementations.relation;

/** Only synthetic test identities: what a sandbox application authenticates. */
const SYNTHETIC_ONLY: FixedFilterInput = { field: 'is_synthetic', op: 'eq', value: true };

/** The kit's relation select, narrowed to synthetic identities while a sandbox application is chosen. */
export function SandboxIdentityInput(props: ScalarInputProps<unknown, Meta>): React.ReactElement | null {
  const application = typeof props.meta.sandboxApplication === 'string' ? props.meta.sandboxApplication : '';
  const app = useOne(CLIENT_APPLICATION_RESOURCE, { id: application, enabled: application !== '' });
  const Input = relation.Input;
  if (Input === undefined) return null;
  const row = (application === '' ? undefined : app.data?.data) as Readonly<Record<string, unknown>> | undefined;
  const fixedFilters = (props as { readonly fixedFilters?: readonly FixedFilterInput[] }).fixedFilters ?? [];
  const narrowed = row?.is_sandbox === true ? [...fixedFilters, SYNTHETIC_ONLY] : fixedFilters;
  return <Input {...props} {...{ fixedFilters: narrowed }} />;
}
