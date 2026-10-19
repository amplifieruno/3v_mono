import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import type { HasuraClient } from '../hasura/client.js';
import { DUE_BATCH, runSavedSearches } from './savedSearches.js';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function row(i: number) {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    organization_id: ORG,
    owner_id: ORG,
    schedule_cron: '0 * * * *',
    next_run_at: null,
    search_type: 'attribute',
    image_file_id: null,
    filters: {},
    threshold: null,
    max_results: 20,
    fuzzy: false,
    organization: { timezone: 'UTC' },
  };
}

describe('runSavedSearches', () => {
  it('should page through every due saved search by id', async () => {
    const all = Array.from({ length: DUE_BATCH + 1 }, (_, i) => row(i + 1));
    const dueCalls: Record<string, unknown>[] = [];
    const request = vi.fn(async (query: string, variables: Record<string, unknown> = {}) => {
      if (query.includes('DueSavedSearches')) {
        dueCalls.push(variables);
        const after = variables.after as string;
        return { saved_searches: all.filter((r) => r.id > after).slice(0, variables.limit as number) };
      }
      if (query.includes('init_saved_search')) return { init_saved_search: [{ id: variables.id }] };
      throw new Error(`unexpected ${query}`);
    });
    const result = await runSavedSearches.handle(
      { id: 'x', name: 'run_saved_searches', scheduled_time: '2030-01-01T10:00:00Z', payload: {}, comment: null },
      { env: {} as Env, admin: { request } as unknown as HasuraClient, idempotencyKey: 'k' },
    );
    expect(result).toMatchObject({ initialized: DUE_BATCH + 1 });
    expect(dueCalls).toHaveLength(2);
    expect(dueCalls[1].after).toBe(all[DUE_BATCH - 1].id);
  });
});
