# Testing Skill

Run and write tests for the ITAP project using Vitest (unit) and Playwright (E2E/visual).

## Test Frameworks

| Framework | Purpose | Location |
|---|---|---|
| Vitest | Unit and integration tests | `**/*.test.ts`, `**/*.test.tsx` |
| Playwright | E2E and visual tests | `tests/e2e/**/*.spec.ts` |

## Commands

### Unit Tests (Vitest)

```bash
# Run all unit tests
pnpm test

# Run tests for a specific app
cd apps/admin-ui && pnpm test
cd apps/backend && pnpm test

# Run a specific test file
pnpm test -- path/to/file.test.ts

# Run tests in watch mode
pnpm test -- --watch

# Run with coverage
pnpm test -- --coverage
```

### E2E Tests (Playwright)

```bash
# Run all E2E tests
npx playwright test

# Run a specific test file
npx playwright test tests/e2e/identity.spec.ts

# Run with headed browser (visible)
npx playwright test --headed

# Run specific project (browser)
npx playwright test --project=chromium

# Generate test report
npx playwright show-report
```

### Visual Verification with Playwright MCP

For visual verification during development, use the Playwright MCP browser tools:

```
# Take a snapshot of the current page state
mcp__playwright__browser_snapshot

# Take a screenshot for visual comparison
mcp__playwright__browser_take_screenshot

# Navigate and interact
mcp__playwright__browser_navigate --url "http://localhost:3000/page"
mcp__playwright__browser_click --ref "button-ref"
```

This is particularly useful for verifying UI changes without running full E2E suites.

## Prerequisites

### Docker Infrastructure

Backend tests require Docker services to be running:

```bash
# Start infrastructure
make dev-compose

# Or manually
docker-compose --env-file .env.dev -f docker/docker-compose.dev.yml up -d
```

Required services:
- PostgreSQL (database)
- Hasura/Nhost (GraphQL engine)
- Redis (cache/sessions)
- Minio (file storage)

### Frontend Dev Server

E2E tests require the frontend dev server:

```bash
pnpm run dev
```

## Writing Unit Tests (Vitest)

### Pattern

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('FeatureName', () => {
  it('should handle the success case', () => {
    const result = feature(validInput);
    expect(result).toEqual(expected);
  });

  it('should handle the error case', () => {
    expect(() => feature(invalidInput)).toThrow('Expected error');
  });

  it('should call dependency correctly', () => {
    const mockDep = vi.fn().mockReturnValue('mocked');
    const result = featureWithDep(mockDep);
    expect(mockDep).toHaveBeenCalledWith(expectedArg);
  });
});
```

### File Naming

- Test files live next to the source: `Component.tsx` -> `Component.test.tsx`
- Or in a `__tests__` directory: `__tests__/Component.test.tsx`

### What to Test

- Pure functions and utilities
- Custom hooks (with `@testing-library/react-hooks`)
- Component rendering and interactions
- API response handling
- Error states and edge cases

## Writing E2E Tests (Playwright)

### Pattern

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/feature');
  });

  test('should display the feature list', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Features' })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('should create a new feature', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Feature' }).click();
    await page.getByLabel('Name').fill('Test Feature');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Test Feature')).toBeVisible();
  });

  test('should handle errors gracefully', async ({ page }) => {
    // Intercept API to simulate error
    await page.route('**/api/features', route =>
      route.fulfill({ status: 500 })
    );
    await page.reload();
    await expect(page.getByText('Something went wrong')).toBeVisible();
  });
});
```

### Visual Regression

```typescript
test('should match visual snapshot', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveScreenshot('dashboard.png');
});
```

## Test Organization

```
apps/
  admin-ui/
    src/
      components/
        FeatureCard.tsx
        FeatureCard.test.tsx      # Unit test
      hooks/
        useFeature.ts
        useFeature.test.ts        # Hook test
      pages/
        feature/
          index.tsx
          index.test.tsx           # Page test
tests/
  e2e/
    feature.spec.ts               # E2E test
    auth.spec.ts
    dashboard.spec.ts
```

## Rules

- DO: Write tests for critical paths first
- DO: Test error states, not just happy paths
- DO: Use Playwright MCP tools for quick visual checks during development
- DO: Keep tests independent (no shared state between tests)
- DO: Start Docker infrastructure before running backend tests
- DON'T: Mock everything -- test real integrations where feasible
- DON'T: Write flaky tests that depend on timing
- DON'T: Skip tests to make CI pass
- DON'T: Test implementation details (test behavior, not internals)
