/**
 * The identity list's saved views: unknown people (no profile, still matched), known people,
 * identities whose matching is off (consent withdrawn) and the sandbox's synthetic identities.
 */
export function identitySavedViews() {
  return [
    {
      // The faces cameras saw, latest first (identities never seen sort last only here: G88).
      id: 'seen',
      texts: 'Seen by cameras',
      state: {
        filters: [{ field: 'last_seen_at', op: 'isNotNull' }],
        sort: [{ field: 'last_seen_at', direction: 'desc' as const }],
      },
    },
    {
      id: 'unknown',
      texts: 'Unknown people',
      state: {
        filters: [
          { field: 'profile_id', op: 'isNull' },
          { field: 'status', op: 'in', value: ['unverified', 'pending_verification', 'verified', 'suspended'] },
          { field: 'is_synthetic', op: 'eq', value: false },
        ],
      },
    },
    {
      id: 'known',
      texts: 'Known people',
      state: { filters: [{ field: 'profile_id', op: 'isNotNull' }] },
    },
    {
      id: 'matching-off',
      texts: 'Matching off',
      state: { filters: [{ field: 'matching_enabled', op: 'eq', value: false }] },
    },
    {
      id: 'synthetic',
      texts: 'Synthetic',
      state: { filters: [{ field: 'is_synthetic', op: 'eq', value: true }] },
    },
  ];
}
