import { vi } from 'vitest';
import { hasuraResponse } from './console-dom';

/** Shared by the analytic block tests: ids, block messages and a fake Hasura answering by operation name. */

export const ORG = '11111111-1111-4111-8111-111111111111';
export const FACILITY = '22222222-2222-4222-8222-222222222222';

/** A block's string texts, as `renderBlock` takes its messages. */
export function messagesOf(block: { readonly texts?: unknown }): Record<string, string> {
  return Object.fromEntries(
    Object.entries((block.texts ?? {}) as Record<string, unknown>).filter(([, value]) => typeof value === 'string'),
  ) as Record<string, string>;
}

/** The fake server's answers by GraphQL operation name (`query <Name>`); anything else answers `{}`. */
export type Answers = Record<string, unknown>;

/** Stubs `fetch` with the answers; returns the request bodies sent so far. */
export function stubHasura(answers: () => Answers): () => { operation: string; variables: Record<string, unknown> }[] {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = String(init?.body ?? '');
      const name = /query (\w+)/u.exec(body)?.[1] ?? '';
      const answer = answers()[name];
      return hasuraResponse(answer === undefined ? { data: {} } : { data: answer });
    }),
  );
  return () =>
    vi
      .mocked(fetch)
      .mock.calls.map(([, init]) => JSON.parse(String(init?.body ?? '{}')) as { query?: string; variables?: Record<string, unknown> })
      .map((sent) => ({ operation: /query (\w+)/u.exec(sent.query ?? '')?.[1] ?? '', variables: sent.variables ?? {} }));
}
