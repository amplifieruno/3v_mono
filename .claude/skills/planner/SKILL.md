# Planning Skill

Decompose a goal into structured task documentation and bd issues with implementation specs.

## Invocation

```bash
/planner "<goal description>"
```

## Workflow

### Step 1: Understand the Goal

Read project context to understand scope and constraints:

```bash
cat CLAUDE.md
cat .claude/AGENTS.md

# Check current implementation stage priorities
ls docs/stages/
cat docs/stages/SA_2_EN.md
cat docs/stages/SA_3_EN.md
cat docs/stages/SA_4_EN.md
```

### Step 2: Research the Codebase

Before planning anything, understand what already exists:

```bash
# Project structure
ls apps/
ls packages/

# Existing pages and components
ls apps/admin-ui/src/pages/ 2>/dev/null
ls apps/admin-ui/src/components/ 2>/dev/null

# Existing backend routes
ls apps/backend/src/ 2>/dev/null

# Hasura tables and metadata
ls apps/nhost/nhost/metadata/databases/default/tables/ 2>/dev/null

# Check existing patterns
grep -r "export default" --include="*.tsx" apps/admin-ui/src/pages/ | head -20

# Check existing bd issues
bd list
bd ready
```

### Step 3: Create Task Overview

Create a task folder and write the overview document:

```bash
mkdir -p tasks/<task-name>
mkdir -p tasks/<task-name>/specs
```

Write `tasks/<task-name>/overview.md`:

```markdown
# <Task Name>

## Goal
[Clear statement of what we are trying to achieve]

## Context
[Why this matters, what stage of the roadmap this addresses]
[Reference: docs/stages/SA_X_EN.md]

## Scope
[What is IN scope and what is OUT of scope]

## Approach
[High-level technical approach]

## Subtasks
1. [Subtask 1] -> see specs/01-subtask-name.md
2. [Subtask 2] -> see specs/02-subtask-name.md
3. [Subtask 3] -> see specs/03-subtask-name.md

## Dependencies
- [External dependencies, services, or existing features required]

## Success Criteria
- [ ] All subtasks completed
- [ ] Quality gates pass (pnpm lint, pnpm typecheck, pnpm build)
- [ ] [Goal-specific criteria]
```

### Step 4: Write Specs for Each Subtask

For each subtask, create a detailed spec in `tasks/<task-name>/specs/`:

Write `tasks/<task-name>/specs/01-subtask-name.md`:

```markdown
# Subtask: <Name>

## Objective
[Specific, implementable description]

## Files (Exclusive Ownership)
- `path/to/file1.tsx` -- [Create/Modify] [description]
- `path/to/file2.ts` -- [Create/Modify] [description]

## Implementation Details

### Step-by-step
1. [First thing to do]
2. [Second thing to do]
3. [Third thing to do]

### Patterns to Follow
Reference: `path/to/existing/similar/file.tsx`
[Describe which patterns to reuse]

### Data Model
[If Hasura changes are needed, describe the schema]

### UI Components
[If frontend work, list shadcn/ui components to use]

## Acceptance Criteria
- [ ] TypeScript compiles: `pnpm typecheck`
- [ ] Lint passes: `pnpm lint`
- [ ] Build succeeds: `pnpm build`
- [ ] [Feature-specific criteria]

## Estimated Effort
[15-30 minutes]
```

### Step 5: Create bd Issues

For each spec, create a corresponding `bd` issue:

```bash
bd create --title "<type>: <brief description>" --description "See tasks/<task-name>/specs/01-subtask-name.md for full spec.

Files (exclusive):
- path/to/file1.tsx
- path/to/file2.ts

Acceptance:
- pnpm typecheck passes
- pnpm lint passes
- pnpm build passes
- [Feature criteria]"
```

### Step 6: Link Everything

Update the overview with bd issue IDs:

```markdown
## Subtasks
1. [BD-123] Subtask 1 -> see specs/01-subtask-name.md
2. [BD-124] Subtask 2 -> see specs/02-subtask-name.md
3. [BD-125] Subtask 3 -> see specs/03-subtask-name.md
```

## Considering docs/stages/ Priorities

The `docs/stages/` directory contains the implementation roadmap:

- **SA_2**: Core foundation (Identity DB, Device management, basic face recognition)
- **SA_3**: Real-time features (tracking, multi-camera, analytics)
- **SA_4**: Advanced features (heatmaps, profiles, segments, API/SDK)

When planning, align tasks with the current stage. Check which stage features are already implemented and which are next.

```bash
# See what stage the project is currently in
# Look at implemented features vs. stage requirements
grep -r "TODO\|FIXME\|PLACEHOLDER" --include="*.ts" --include="*.tsx" apps/ | head -20
```

## Output

After planning is complete, output a summary:

```
PLANNING COMPLETE
=================
Task: <task-name>
Subtasks: N
bd issues: [list of IDs]
Documentation: tasks/<task-name>/

Ready for execution with: /multi-agent or manual implementation
```

## Rules

- DO: Research existing code thoroughly before planning
- DO: Keep subtasks small (15-30 min each)
- DO: Assign exclusive file ownership
- DO: Reference existing patterns for implementers to follow
- DO: Align with docs/stages/ priorities
- DO: Create both documentation AND bd issues
- DON'T: Plan work for generated files
- DON'T: Create overlapping file assignments
- DON'T: Skip the research step
- DON'T: Plan Go code -- TypeScript only
- DON'T: Over-plan -- this is a demo project, keep it practical
