# Agent Roles

Role definitions for Agent Teams. Teammates read this file to understand their responsibilities.

## Planner

Analyzes tasks and creates work breakdown.

**Responsibilities:**
- Analyze codebase structure and existing patterns
- Decompose goal into atomic tasks (15-30 min each)
- Assign exclusive file ownership to each task (no overlap!)
- Create issues in `bd` with detailed descriptions
- Set task dependencies
- Create task documentation in `tasks/<task-name>/overview.md`

**Before creating tasks:**
```bash
# Search for existing patterns
grep -r "export.*function\|export.*const" --include="*.ts" --include="*.tsx" apps/

# Check Hasura metadata
ls apps/nhost/nhost/metadata/databases/default/tables/

# Check existing components
ls apps/admin-ui/src/components/
ls apps/admin-ui/src/pages/
```

**Task template:**
```markdown
## Objective
[What needs to be done]

## Files (EXCLUSIVE)
- apps/admin-ui/src/pages/feature/index.tsx -- [changes]
- apps/admin-ui/src/components/feature/Component.tsx -- [changes]

## Acceptance Criteria
- [ ] TypeScript compiles: pnpm typecheck
- [ ] Lint passes: pnpm lint
- [ ] Build succeeds: pnpm build
- [ ] Visual check via Playwright passes
```

---

## Implementer

Writes code following existing patterns.

**Responsibilities:**
- Claim task from `bd ready`
- Search for existing patterns before writing
- Follow project architecture:
  - Hasura for data layer (GraphQL + migrations)
  - React + TypeScript for frontend
  - Express + TypeScript for backend APIs
  - shadcn/ui for UI components
- Run quality gates before commit
- Push to shared branch

**Workflow:**
```bash
bd update TASK_ID --status in_progress  # Claim
# ... implement ...
pnpm lint                                # Lint
pnpm typecheck                           # TypeScript
pnpm build                               # Build
# Record demo (UI changes only) — see .claude/skills/demo-record/SKILL.md
git pull --rebase && git push           # Push
bd close TASK_ID                         # Complete
```

**Rules:**
- DO: Reuse existing code, follow patterns
- DO: Run `pnpm lint` and `pnpm typecheck` before every commit
- DO: Use shadcn/ui components, not raw HTML
- DO: Record a demo video after quality gates pass (for UI changes)
- DON'T: Modify files outside task scope
- DON'T: Skip quality gates
- DON'T: Over-engineer — this is a DEMO project

---

## Reviewer

Reviews code for quality, security, and patterns.

**Focus areas:**
- **Security**: XSS, injection, auth issues, secrets in code
- **Performance**: N+1 queries, unnecessary re-renders, bundle size
- **Hasura**: Permission rules, role-based access, GraphQL optimization
- **Patterns**: Component structure, state management, error handling
- **Types**: TypeScript strictness, proper typing

**Output format:**
```markdown
## [SEVERITY] Issue Title
**File:** path/to/file.tsx:123
**Issue:** Description
**Fix:** Suggested solution
```

Severities: CRITICAL, HIGH, MEDIUM, LOW

---

## Test Writer

Adds test coverage for uncovered code.

**Responsibilities:**
- Find gaps in test coverage
- Write Vitest tests for backend services
- Write Playwright tests for UI flows
- Test happy path AND error cases

**Pattern (Vitest):**
```typescript
import { describe, it, expect } from 'vitest'

describe('FeatureName', () => {
  it('should handle success case', () => {
    const result = feature(input)
    expect(result).toEqual(expected)
  })

  it('should handle error case', () => {
    expect(() => feature(badInput)).toThrow()
  })
})
```

**Pattern (Playwright):**
```typescript
import { test, expect } from '@playwright/test'

test('feature page loads correctly', async ({ page }) => {
  await page.goto('/feature')
  await expect(page.getByRole('heading')).toContainText('Feature')
})
```

---

## Hasura Architect

Designs and implements database schema and Hasura configuration.

**Responsibilities:**
- Design PostgreSQL table schemas
- Create Hasura migrations
- Configure permissions and relationships
- Generate GraphQL operations
- Ensure schema consistency

**Workflow:**
```bash
# Apply migrations
make hasura_apply

# Check Hasura console
# http://localhost:1337 (Nhost dashboard)

# Generate GraphQL types
cd apps/admin-ui && pnpm gql
```

---

## UI Implementer

Writes frontend code following existing UI patterns.

**Responsibilities:**
- Implement React pages and components
- Use shadcn/ui components from the library
- Follow Refine patterns for CRUD resources
- Use TailwindCSS v4 for styling
- Verify work via Playwright MCP browser tools

**Workflow:**
```bash
bd update TASK_ID --status in_progress  # Claim
# ... implement ...
pnpm lint                                # Lint
pnpm typecheck                           # TypeScript
# Record demo video — see .claude/skills/demo-record/SKILL.md
git pull --rebase && git push           # Push
bd close TASK_ID                         # Complete
```

**Rules:**
- DO: Follow existing page patterns as canonical reference
- DO: Use shadcn/ui components
- DO: Verify UI with Playwright snapshot/screenshot
- DO: Record a demo video after quality gates pass
- DON'T: Use raw HTML elements when shadcn component exists
- DON'T: Use inline styles — use TailwindCSS
- DON'T: Import from node_modules directly when a wrapper exists

---

## Communication

### Asking for help
```
BLOCKED on [TASK_ID]
Issue: [what's wrong]
Tried: [what you attempted]
Need: [what would help]
```

### Sharing findings
```
Found useful pattern:
File: [path]
Pattern: [description]
Usage: [how to use]
```

### Progress update
```
Progress on [TASK_ID]:
- [x] Step 1 done
- [ ] Step 2 in progress
```
