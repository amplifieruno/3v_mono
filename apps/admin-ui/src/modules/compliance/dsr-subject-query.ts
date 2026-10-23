import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { PROFILE_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { COMPLIANCE_BINDING } from './retention-policy-ops';

/** The person an erasure is about, as its review shows them. */
export const dsrSubject = z.object({
  id: z.string(),
  code: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  erased_at: z.string().nullable(),
  processing_restricted: z.boolean(),
  identities: z.number(),
});

export type DsrSubject = z.infer<typeof dsrSubject>;

/** Reads a profile row of the subject query into {@link DsrSubject} (`null`: not found or unreadable). */
export function subjectOf(row: unknown): DsrSubject | null {
  if (row === null || typeof row !== 'object') return null;
  const value = row as Record<string, unknown>;
  const aggregate = value.identities_aggregate as { aggregate?: { count?: unknown } } | undefined;
  const parsed = dsrSubject.safeParse({ ...value, identities: aggregate?.aggregate?.count ?? 0 });
  return parsed.success ? parsed.data : null;
}

export const dsrSubjectOperation = hasuraOperation(COMPLIANCE_BINDING, 'dataSubject', {
  kind: 'query',
  document: `query DataSubject($id: uuid!) {
  profiles_by_pk(id: $id) {
    id code first_name last_name erased_at processing_restricted
    identities_aggregate { aggregate { count } }
  }
}`,
  variables: (input) => ({ id: (input as { profileId: string }).profileId }),
  mapResult: (data) => subjectOf(rootOf(data, 'profiles_by_pk')),
});

/** The subject of an erasure request: name, code, identities, whether already erased or restricted. */
export const dataSubject = defineQuery('itap:data-subject', {
  binding: dsrSubjectOperation.binding,
  input: schema(z.object({ profileId: z.string().uuid() })),
  output: schema(dsrSubject.nullable()),
  reads: [resourceByName(PROFILE_RESOURCE)],
});

/** Whether a typed confirmation names the subject's code (case and surrounding spaces aside). */
export function confirmsCode(typed: unknown, code: string | null | undefined): boolean {
  if (typeof typed !== 'string' || typeof code !== 'string' || code === '') return false;
  return typed.trim().toUpperCase() === code.trim().toUpperCase();
}
