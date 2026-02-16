# Task Documentation

This directory contains documentation for each task/feature worked on in the project. It serves as a knowledge base and audit trail of implementation decisions.

## Directory Structure

```
tasks/
├── README.md                         # This file
├── <task-name>/                      # One folder per task
│   ├── overview.md                   # Task description, goals, context
│   ├── specs/                        # Implementation specifications
│   │   ├── 01-data-model.md          # Spec for data model changes
│   │   ├── 02-api-endpoints.md       # Spec for API work
│   │   └── 03-ui-pages.md            # Spec for frontend work
│   ├── demo/                         # Demo video recordings (for UI tasks)
│   │   └── *.webm                    # Playwright video walkthroughs
│   └── summary.md                    # Post-completion summary
```

## Workflow

### 1. Task Creation (`overview.md`)

When starting a new task, create a folder and write `overview.md`:

```markdown
# Task: <Title>

## Goal
What we're trying to achieve.

## Context
Why this is needed. Reference to docs/stages/ or docs/base/ if applicable.

## Scope
- What's included
- What's NOT included

## Beads Issues
- mono-xxx: Main issue
- mono-yyy: Sub-issue (if any)

## Technical Approach
High-level approach before diving into specs.
```

### 2. Specification (`specs/`)

Break the task into implementation specs. Each spec is a self-contained unit of work:

```markdown
# Spec: <Title>

## Objective
Specific deliverable for this spec.

## Files to Create/Modify
- `path/to/file.ts` — What to change
- `path/to/new-file.tsx` — What to create

## Implementation Details
Step-by-step what to do.

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Quality gates pass (pnpm lint, pnpm typecheck)

## Beads Issue
mono-xxx
```

**Guidelines:**
- Small tasks: 1 spec is fine
- Large tasks: Split into 3-7 specs
- Each spec should be completable in 15-60 minutes
- Specs should have minimal file overlap (for parallel agent work)

### 3. Completion Summary (`summary.md`)

After finishing the task, write a summary:

```markdown
# Summary: <Title>

## What Was Done
Brief description of what was implemented.

## Key Decisions
- Decision 1: Why we chose approach A over B
- Decision 2: Trade-offs made

## Files Changed
- `path/to/file.ts` — Description of changes
- `path/to/new-file.tsx` — New file purpose

## Beads Issues Closed
- mono-xxx: Completed
- mono-yyy: Completed

## Known Limitations
- Limitation 1: Why and potential future fix
- Limitation 2: Acceptable for DEMO scope

## Lessons Learned
What worked well, what to do differently next time.
```

## Integration with Beads

- Each task folder name should match or relate to the bd issue title
- Reference bd issue IDs in overview.md and specs
- Close bd issues when specs are completed
- The summary.md serves as the technical realization document

## Example

```
tasks/
├── identity-crud/
│   ├── overview.md          # "Implement Identity CRUD pages"
│   ├── specs/
│   │   ├── 01-hasura-schema.md    # Database tables + Hasura config
│   │   ├── 02-graphql-ops.md      # GraphQL operations + codegen
│   │   └── 03-admin-ui-pages.md   # React list/create/edit pages
│   ├── demo/                # Video recordings of the feature
│   │   └── identity-crud-demo.webm
│   └── summary.md           # What was built, decisions made
├── face-scanning/
│   ├── overview.md          # "Add face scanning to profile management"
│   ├── specs/
│   │   └── 01-face-scanner.md     # Single spec (small task)
│   └── summary.md
```
