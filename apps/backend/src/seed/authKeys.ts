/**
 * Which key the seeded history sessions of an app reference (keys ordered by created_at). A completed seed left the
 * history key revoked (rotation completed); an interrupted one may have left keys without that revocation — then the
 * oldest key that does not expire is used (else the oldest), so history sessions never lack a key.
 */
export type KeyRow = { id: string; revoked_at: string | null; expires_at: string | null };
export type HistoryKey = { kind: 'seed' } | { kind: 'existing' | 'recovered'; id: string };

export function historyKeyOf(keys: KeyRow[]): HistoryKey {
  if (keys.length === 0) return { kind: 'seed' };
  const revoked = keys.find((k) => k.revoked_at !== null && k.expires_at === null);
  if (revoked) return { kind: 'existing', id: revoked.id };
  return { kind: 'recovered', id: (keys.find((k) => k.expires_at === null) ?? keys[0]).id };
}
