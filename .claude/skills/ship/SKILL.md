# Ship Workflow

Packages completed work into a pull request with documentation and summary.

## Invocation

```bash
/ship
```

## Workflow

### Step 1: Collect Completed Tasks

```bash
# List all closed tasks from this work session
bd list --status closed

# Check for any remaining in-progress work
bd list --status in_progress
bd list --status blocked
```

All `in_progress` tasks should be either completed or documented as incomplete before shipping.

### Step 2: Analyze Branch Diff

```bash
# Identify the base branch
git log --oneline main..HEAD

# Full diff against main
git diff main...HEAD --stat

# Detailed diff for the PR body
git diff main...HEAD
```

### Step 3: Generate Task Summary

For each completed task, create a summary in the task documentation folder:

```bash
mkdir -p tasks/<task-name>
```

Write `tasks/<task-name>/summary.md`:

```markdown
# <Task Name> - Summary

## Status: COMPLETE

## What Was Done
- [Bullet points of changes made]

## Files Changed
- `path/to/file.tsx` -- [what changed]
- `path/to/file.ts` -- [what changed]

## Quality Gates
- [x] pnpm lint -- passed
- [x] pnpm typecheck -- passed
- [x] pnpm build -- passed

## Demo
- Video: `playwright-output/<filename>.webm` (or "No UI changes -- demo skipped")

## Notes
[Any additional context for reviewers]
```

### Step 3.5: Record Demo (UI Changes Only)

If the branch includes **UI changes**, record a video walkthrough using Playwright before creating the PR.

Follow the recipe in `.claude/skills/demo-record/SKILL.md`:

1. Use `mcp__playwright__browser_run_code` to create a browser context with `recordVideo` enabled
2. Walk through the implemented features (navigate, demonstrate CRUD, show key interactions)
3. Close the context to save the video to `playwright-output/`
4. Note the video path to include in the PR body and task summary

If no UI changes are included, skip this step and note "No UI changes -- demo skipped."

### Step 4: Create or Update Pull Request

```bash
# Create PR with gh CLI
gh pr create --title "<type>: <brief description>" --body "$(cat <<'EOF'
## Summary
- [Key change 1]
- [Key change 2]
- [Key change 3]

## Tasks Completed
- [TASK_ID] - Task title
- [TASK_ID] - Task title

## Quality Gates
- [x] `pnpm lint` passes
- [x] `pnpm typecheck` passes
- [x] `pnpm build` passes

## Demo
- [Demo video](playwright-output/<filename>.webm) (or "No UI changes -- demo skipped")

## Test Plan
- [ ] [How to verify change 1]
- [ ] [How to verify change 2]

## Task Documentation
See `tasks/` directory for detailed summaries of each task.

---
Generated with Claude Code
EOF
)"
```

If a PR already exists for this branch:

```bash
# Update existing PR
gh pr edit --title "<updated title>" --body "$(cat <<'EOF'
[updated body]
EOF
)"
```

### Step 5: Quality Gates (Optional)

Quality gates are optional during ship since workers should have already run them. However, for confidence:

```bash
pnpm lint && pnpm typecheck && pnpm build
```

If gates fail, fix issues before shipping.

### Step 6: Final Push

```bash
# Ensure everything is pushed
git pull --rebase
bd sync
git push

# Verify
git status
git log origin/HEAD..HEAD --oneline  # Should be empty
```

## Task Documentation Structure

```
tasks/
  <task-name>/
    overview.md      # Created by Planner (goal, file ownership, criteria)
    summary.md       # Created by Ship (results, files changed, notes)
    specs/           # Optional detailed specifications
      spec-1.md
      spec-2.md
```

## PR Title Convention

Follow the same format as commit messages:

```
feat: add identity management dashboard
fix: resolve face detection timeout in camera feed
refactor: simplify Hasura permission configuration
```

## Rules

- DO: Collect all completed tasks before creating the PR
- DO: Write task summaries for documentation
- DO: Include test plan in the PR body
- DO: Push all changes before creating the PR
- DO: Use `gh` CLI for PR operations
- DON'T: Create a PR with unpushed commits
- DON'T: Skip task documentation
- DON'T: Include incomplete tasks without noting their status
- DON'T: Force push to shared branches
