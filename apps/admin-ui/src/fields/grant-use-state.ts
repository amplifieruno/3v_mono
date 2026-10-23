import { instantOf } from './date-time-format';

/** What a grant row says about its use. */
export type GrantUseState =
  | { readonly kind: 'used'; readonly at: number }
  | { readonly kind: 'unused' }
  | { readonly kind: 'reusable' };

/**
 * The use of an access grant: a single-use grant is used once a door consumed it (`used_at`
 * set, by the engine only), unused before; a reusable grant is never marked used.
 */
export function grantUseState(usedAt: unknown, record: Readonly<Record<string, unknown>> | undefined): GrantUseState {
  const at = instantOf(usedAt);
  if (at !== null) return { kind: 'used', at };
  return record?.single_use === true ? { kind: 'unused' } : { kind: 'reusable' };
}
