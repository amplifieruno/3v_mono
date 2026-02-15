---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.spec.ts"
---

# Testing Rules

## Test Frameworks

- **Unit and integration tests**: Vitest.
- **End-to-end tests**: Playwright.
- No Jest. No Mocha. No Cypress.

## Test File Naming

- Unit/integration tests: `{module}.test.ts` or `{component}.test.tsx`, co-located with the source file.
- E2E tests: in a dedicated `e2e/` or `tests/` directory, named `{feature}.spec.ts`.

## Test Coverage Expectations

- Test both the happy path and error cases for every function and component.
- For React components: test rendering, user interactions, and error/loading states.
- For hooks: test with `renderHook` from `@testing-library/react`.
- For API handlers: test valid input, invalid input, and authorization failures.

## Writing Tests

- Use `describe` and `it` blocks. Write test names as complete sentences starting with "should".
- Prefer `@testing-library/react` and `@testing-library/user-event` for component tests. Query by role, label, or text -- never by CSS class or test ID unless absolutely necessary.
- Mock external dependencies (API calls, GraphQL) at the boundary, not deep inside modules.

```typescript
describe('IdentityCard', () => {
  it('should display the identity label and confidence score', () => {
    render(<IdentityCard identity={mockIdentity} />);
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('95%')).toBeInTheDocument();
  });

  it('should show a fallback avatar when no face image is available', () => {
    render(<IdentityCard identity={{ ...mockIdentity, faceUrl: null }} />);
    expect(screen.getByRole('img', { name: /avatar/i })).toBeInTheDocument();
  });
});
```

## Visual Verification

- After making UI changes, use Playwright MCP tools (`browser_snapshot`, `browser_take_screenshot`) to visually verify the result.
- Take screenshots of key states (empty, loading, populated, error) for important pages.

## Pre-Commit Checks

Before every commit, run:

```bash
pnpm lint
pnpm typecheck
```

If either fails, fix the issues before committing. Do not skip these checks.

## Test Execution

```bash
pnpm test              # Run all unit/integration tests
pnpm test:e2e          # Run Playwright E2E tests
pnpm test -- --watch   # Watch mode during development
```
