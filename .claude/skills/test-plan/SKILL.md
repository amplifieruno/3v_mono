# Test Plan Generation

Analyze code coverage gaps and generate a comprehensive test plan with bd issues for test implementation tasks.

## Invocation

```bash
/test-plan
```

## Workflow

### Step 1: Analyze Current Coverage

```bash
# Check existing test files
find apps/ -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" | head -50

# Check E2E tests
ls tests/e2e/ 2>/dev/null

# Run coverage report if available
pnpm test -- --coverage 2>/dev/null

# List all source files that could have tests
find apps/admin-ui/src -name "*.tsx" -not -name "*.test.*" | head -50
find apps/backend/src -name "*.ts" -not -name "*.test.*" | head -50
```

### Step 2: Identify Coverage Gaps

Categorize untested code by priority:

**Critical** (must test):
- Authentication flows
- Face recognition pipelines
- Data mutation operations (create, update, delete)
- Permission and access control logic

**High** (should test):
- Page rendering and navigation
- Form validation and submission
- API error handling
- WebSocket/real-time connections

**Medium** (nice to test):
- UI component rendering
- Responsive layout behavior
- Loading and empty states

**Low** (optional):
- Static content pages
- Utility formatting functions
- Pure display components

### Step 3: Design Playwright Test Scenarios

For this demo project, **visual verification is the priority**. Focus on Playwright E2E tests that verify the application works end-to-end.

Design scenarios for each page/feature:

```markdown
## Scenario: Identity List Page
- Navigate to /identities
- Verify table renders with columns
- Test search/filter functionality
- Test pagination
- Visual snapshot comparison

## Scenario: Profile Creation
- Navigate to /profiles/new
- Fill in form fields
- Upload face image
- Submit and verify redirect
- Verify profile appears in list
```

### Step 4: Create bd Issues for Test Tasks

Create one `bd` issue per test scenario:

```bash
bd create --title "test: E2E test for identity list page" --description "$(cat <<'EOF'
## Objective
Write Playwright E2E tests for the identity list page.

## Test Cases
1. Page loads and displays heading
2. Table renders with correct columns
3. Search filters results correctly
4. Pagination works
5. Visual snapshot matches baseline

## Files
- tests/e2e/identity-list.spec.ts

## Acceptance Criteria
- [ ] All test cases pass: npx playwright test tests/e2e/identity-list.spec.ts
- [ ] Visual snapshots generated
- [ ] No flaky tests (run 3x to verify)
EOF
)"
```

### Step 5: Generate Test Plan Document

Write a test plan overview:

```bash
mkdir -p tasks/test-plan
```

Write `tasks/test-plan/overview.md`:

```markdown
# Test Plan

## Coverage Summary
- Unit tests: N files covered / M total
- E2E tests: N scenarios / M pages
- Visual tests: N snapshots

## Priority Matrix

| Feature | Unit | E2E | Visual | Priority |
|---|---|---|---|---|
| Auth flow | [ ] | [ ] | [ ] | Critical |
| Identity CRUD | [ ] | [ ] | [ ] | Critical |
| Dashboard | [ ] | [ ] | [ ] | High |
| Profile mgmt | [ ] | [ ] | [ ] | High |
| Settings | [ ] | [ ] | [ ] | Medium |

## Test Issues Created
- [TASK_ID] - test: E2E for identity list
- [TASK_ID] - test: E2E for profile creation
- [TASK_ID] - test: unit tests for auth hooks

## Infrastructure Requirements
- Docker services running (make dev-compose)
- Frontend dev server running (pnpm dev)
- Test database seeded with fixtures
```

## Visual Verification Focus

Since ITAP is a demo project, visual verification is paramount. Prioritize tests that:

1. **Verify page renders correctly** -- Use Playwright screenshots and snapshots
2. **Test critical user flows** -- Login, create identity, search, view dashboard
3. **Catch regressions** -- Visual snapshot baselines for key pages
4. **Demo readiness** -- Ensure all demo-able features work end-to-end

Use Playwright MCP tools for quick verification during development:

```
# Quick visual check of a page
mcp__playwright__browser_navigate --url "http://localhost:3000/identities"
mcp__playwright__browser_take_screenshot --type png
mcp__playwright__browser_snapshot
```

## Rules

- DO: Focus on E2E and visual tests for demo readiness
- DO: Create actionable bd issues with specific test cases
- DO: Prioritize critical paths over edge cases
- DO: Design tests that are independent and not flaky
- DON'T: Aim for 100% coverage -- focus on value
- DON'T: Create tests for generated code
- DON'T: Write tests that require manual intervention
- DON'T: Skip infrastructure requirements in the plan
