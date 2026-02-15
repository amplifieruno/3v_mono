---
paths:
  - "**/*store*.ts"
  - "**/*hook*.ts"
  - "**/stores/**"
---

# State Management Rules

## Server State: React Query (TanStack Query)

- All data that originates from the server (API responses, database records) is server state.
- Use React Query for all server state: fetching, caching, synchronization, and background updates.
- Wrap each query in a custom hook with a descriptive name (e.g., `useIdentities`, `useProfile`, `useFacilityAreas`).
- Use query keys that reflect the resource hierarchy (e.g., `['identities', id]`, `['facilities', facilityId, 'areas']`).
- Use mutations for all write operations (`useMutation`), and invalidate related queries on success.

```typescript
const useIdentities = (filters?: IdentityFilters) => {
  return useQuery({
    queryKey: ['identities', filters],
    queryFn: () => graphqlClient.request(GET_IDENTITIES, filters),
  });
};
```

## Client State: Zustand

- Use Zustand for UI-only state that does not come from the server (e.g., sidebar open/closed, selected tab, modal visibility, theme preference).
- Keep stores small and focused. One store per domain concern.
- Name stores with a `use` prefix (e.g., `useUIStore`, `useScannerStore`).
- Never put server-fetched data into Zustand. That belongs in React Query.

```typescript
const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}));
```

## Prohibited Patterns

- **No useEffect for data fetching.** Always use React Query.
- **No mixing Zustand and useState for the same state.** Pick one. If the state is local to a single component and simple, `useState` is fine. If it is shared across components, use Zustand.
- **No fetch() or axios calls directly.** All data fetching must go through a GraphQL client (e.g., `graphql-request` or `urql`) wrapped in React Query hooks.
- **No Redux.** Zustand is the only client state library for this project.
- **No useContext for global state.** Use Zustand instead. React Context is acceptable only for dependency injection (e.g., providing a theme or a client instance).

## Data Flow

```
GraphQL API (Hasura)
    |
    v
React Query hooks (custom hooks)
    |
    v
Components (consume via hooks)

UI-only state (Zustand) --> Components
```

## Optimistic Updates

- Use React Query's `onMutate` for optimistic updates when the UI needs to feel instant (e.g., toggling a favorite, updating a status).
- Always implement `onError` rollback alongside optimistic updates.
