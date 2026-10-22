import type { Pagination } from '@burojs/core';

/** The offset page shape `@burojs/hasura` reads; any other shape is ignored and the read gets the default page of 25. */
export type OffsetPagination = Extract<Pagination, { readonly kind: 'offset' }>;

/** Default page size of a test read: large enough for the seeded lists the tests scan. */
const DEFAULT_PAGE_SIZE = 100;

/** An offset page for a list descriptor built by a test. */
export function offsetPage(page: number, pageSize: number = DEFAULT_PAGE_SIZE): OffsetPagination {
  return { kind: 'offset', page, pageSize };
}

/**
 * The loose descriptor input the dev-stack tests pass to their `query` helpers: any descriptor
 * field, with `pagination` held to the provider's shape so a wrong one fails the typecheck.
 */
export type TestQueryInput = Record<string, unknown> & { readonly pagination?: Pagination };
