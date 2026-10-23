import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { ACCESS_POINT_RESOURCE, IDENTITY_RESOURCE, PROFILE_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { ACCESS_BINDING } from './policy-ops';

const namesInput = z.object({
  profileIds: z.array(z.string().uuid()),
  accessPointIds: z.array(z.string().uuid()),
  identityIds: z.array(z.string().uuid()),
});

export type AccessNamesInput = z.infer<typeof namesInput>;

/** Display names by id: people (full name, else code), access points (name), identities (code). */
export const accessNames = z.object({
  profiles: z.record(z.string(), z.string()),
  accessPoints: z.record(z.string(), z.string()),
  identities: z.record(z.string(), z.string()),
});

export type AccessNames = z.infer<typeof accessNames>;

const profileRow = z.object({ id: z.string(), code: z.string().nullable(), first_name: z.string().nullable(), last_name: z.string().nullable() });
const namedRow = z.object({ id: z.string(), name: z.string() });
const codedRow = z.object({ id: z.string(), code: z.string() });

function byId<R extends { readonly id: string }>(rows: unknown, row: z.ZodType<R>, name: (r: R) => string): Record<string, string> {
  const parsed = z.array(row).safeParse(rows);
  return Object.fromEntries((parsed.success ? parsed.data : []).map((r) => [r.id, name(r)]));
}

export const accessNamesOperation = hasuraOperation(ACCESS_BINDING, 'accessNames', {
  kind: 'query',
  document: `query AccessNames($profiles: [uuid!]!, $points: [uuid!]!, $identities: [uuid!]!) {
  profiles(where: { id: { _in: $profiles } }) { id code first_name last_name }
  access_points(where: { id: { _in: $points } }) { id name }
  identities(where: { id: { _in: $identities } }) { id code }
}`,
  variables: (input) => {
    const { profileIds, accessPointIds, identityIds } = input as AccessNamesInput;
    return { profiles: profileIds, points: accessPointIds, identities: identityIds };
  },
  mapResult: (data) => ({
    profiles: byId(rootOf(data, 'profiles'), profileRow, (r) => {
      const name = [r.first_name, r.last_name].filter((part) => part !== null && part !== '').join(' ');
      return name !== '' ? name : (r.code ?? r.id);
    }),
    accessPoints: byId(rootOf(data, 'access_points'), namedRow, (r) => r.name),
    identities: byId(rootOf(data, 'identities'), codedRow, (r) => r.code),
  }),
});

/**
 * The names of the people, access points and identities a simulation or the policy analytics
 * mention by id, in one read (rows the member cannot see, or that were deleted, are absent).
 */
export const accessNamesQuery = defineQuery('itap:access-names', {
  binding: accessNamesOperation.binding,
  input: schema(namesInput),
  output: schema(accessNames),
  reads: [PROFILE_RESOURCE, ACCESS_POINT_RESOURCE, IDENTITY_RESOURCE].map(resourceByName),
});

/** The distinct non-null ids of `pick` over `rows`. */
export function idsOf<R>(rows: readonly R[], pick: (row: R) => string | null | undefined): string[] {
  return [...new Set(rows.flatMap((row) => {
    const id = pick(row);
    return id === null || id === undefined || id === '' ? [] : [id];
  }))];
}
