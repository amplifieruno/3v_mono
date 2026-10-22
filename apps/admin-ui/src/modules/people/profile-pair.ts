import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import {
  CONSENT_RECORD_RESOURCE,
  PROFILE_DOCUMENT_RESOURCE,
  PROFILE_RESOURCE,
} from '../../data/resource-names';
import { schema } from '../../data/schema';
import { PEOPLE_BINDING } from './profile-activity';

const count = z.object({ aggregate: z.object({ count: z.number() }) });

/** One profile as the duplicate comparison reads it, with what a merge would move. */
const pairRow = z.object({
  id: z.string(),
  code: z.string(),
  profile_type: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  employee_id: z.string().nullable(),
  department: z.string().nullable(),
  job_title: z.string().nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  status: z.string(),
  identities_count: z.number(),
  processing_restricted: z.boolean(),
  erased_at: z.string().nullable(),
  created_at: z.string(),
  company: z.object({ name: z.string() }).nullable(),
  profile_documents_aggregate: count,
  consent_records_aggregate: count,
});

/** A profile of a duplicate pair, flattened: its company by name and the counts a merge moves. */
export const pairProfile = z.object({
  id: z.string(),
  code: z.string(),
  profile_type: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  employee_id: z.string().nullable(),
  department: z.string().nullable(),
  job_title: z.string().nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  status: z.string(),
  company: z.string().nullable(),
  identities: z.number(),
  documents: z.number(),
  consents: z.number(),
  processing_restricted: z.boolean(),
  erased_at: z.string().nullable(),
  created_at: z.string(),
});

export type PairProfile = z.infer<typeof pairProfile>;

export const profilePairOutput = z.object({ first: pairProfile.nullable(), second: pairProfile.nullable() });

export type ProfilePair = z.infer<typeof profilePairOutput>;

const profilePairInput = z.object({ first: z.string().uuid(), second: z.string().uuid() });

/** One aliased root (`first` / `second`) of the answer, flattened; missing or unparsable is `null`. */
function pairProfileOf(rows: unknown): PairProfile | null {
  const r = pairRow.safeParse(Array.isArray(rows) ? rows[0] : undefined);
  if (!r.success) return null;
  const { company, profile_documents_aggregate, consent_records_aggregate, identities_count, ...rest } = r.data;
  return {
    ...rest,
    company: company?.name ?? null,
    identities: identities_count,
    documents: profile_documents_aggregate.aggregate.count,
    consents: consent_records_aggregate.aggregate.count,
  };
}

/** The two profiles of the answer. */
export function profilePairOf(data: unknown): ProfilePair {
  return { first: pairProfileOf(rootOf(data, 'first')), second: pairProfileOf(rootOf(data, 'second')) };
}

export const profilePairOperation = hasuraOperation(PEOPLE_BINDING, 'profilePair', {
  kind: 'query',
  document: `query ProfilePair($first: uuid!, $second: uuid!) {
  first: profiles(where: { id: { _eq: $first } }, limit: 1) { ...PairProfile }
  second: profiles(where: { id: { _eq: $second } }, limit: 1) { ...PairProfile }
}

fragment PairProfile on profiles {
  id
  code
  profile_type
  first_name
  last_name
  email
  phone
  employee_id
  department
  job_title
  start_date
  end_date
  status
  identities_count
  processing_restricted
  erased_at
  created_at
  company { name }
  profile_documents_aggregate { aggregate { count } }
  consent_records_aggregate { aggregate { count } }
}`,
  variables: (input) => {
    const { first, second } = input as z.infer<typeof profilePairInput>;
    return { first, second };
  },
  mapResult: profilePairOf,
});

/**
 * Two profiles side by side for the duplicate review: their identifying fields and what a merge
 * would move (identities, documents, consents), plus whether either is restricted or erased.
 */
export const profilePair = defineQuery('itap:profile-pair', {
  binding: profilePairOperation.binding,
  input: schema(profilePairInput),
  output: schema(profilePairOutput),
  reads: [
    resourceByName(PROFILE_RESOURCE),
    resourceByName(PROFILE_DOCUMENT_RESOURCE),
    resourceByName(CONSENT_RECORD_RESOURCE),
  ],
});
