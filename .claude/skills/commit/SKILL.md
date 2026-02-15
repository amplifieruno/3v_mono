# Commit Conventions

Standard commit message format and workflow for the ITAP project.

## Message Format

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Types

| Type | Usage |
|---|---|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `refactor` | Code restructuring without behavior change |
| `style` | Formatting, whitespace, missing semicolons |
| `docs` | Documentation changes |
| `test` | Adding or updating tests |
| `chore` | Build process, tooling, dependencies |
| `perf` | Performance improvement |
| `ci` | CI/CD configuration changes |

### Scopes

| Scope | When to use |
|---|---|
| `admin-ui` | Frontend React application |
| `backend` | Express API server |
| `nhost` | Hasura metadata, migrations, Nhost config |
| `shared` | Shared packages and types |
| `infra` | Docker, CI/CD, deployment configs |
| `face` | Face recognition service/components |
| `db` | Database schema changes |

### Subject Line Rules

- Use imperative mood ("add feature" not "added feature")
- Do not capitalize first letter
- No period at the end
- Maximum 70 characters

### Examples

```
feat(admin-ui): add identity list page with search
fix(backend): resolve JWT token expiration check
refactor(nhost): simplify Hasura permission rules
chore(infra): update Docker Compose for local dev
test(admin-ui): add Playwright tests for login flow
```

## bd Issue References

When a commit relates to a `bd` issue, include it in the footer:

```
feat(admin-ui): add profile management page

Implements the profile CRUD interface with face scan upload.

bd: TASK-123
```

For closing an issue with a commit:

```
fix(backend): resolve face detection timeout

bd: TASK-456
```

## AI Co-Authorship

All commits made by Claude agents must include the co-author trailer:

```
feat(admin-ui): add dashboard analytics widget

bd: TASK-789
Co-Authored-By: Claude <noreply@anthropic.com>
```

## Pre-Commit Checklist

Before every commit, verify:

1. **Lint passes**: `pnpm lint`
2. **Types check**: `pnpm typecheck`
3. **Build succeeds**: `pnpm build`
4. **No secrets**: Check that no `.env`, credentials, or API keys are staged
5. **No generated files**: Ensure `@gql/`, `node_modules/`, `dist/` are not staged
6. **Scope is correct**: Only files related to the commit message are staged

## Workflow

```bash
# 1. Stage specific files (never use git add -A)
git add apps/admin-ui/src/pages/new-feature/index.tsx
git add apps/admin-ui/src/components/new-feature/Card.tsx

# 2. Verify what's staged
git diff --staged --name-only

# 3. Run quality gates
pnpm lint && pnpm typecheck && pnpm build

# 4. Commit with proper format
git commit -m "$(cat <<'EOF'
feat(admin-ui): add new feature page and card component

Implements the feature list page with filterable card grid.

bd: TASK-123
Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"

# 5. Push
git pull --rebase
git push
```

## Multi-File Commits

If a single logical change spans multiple scopes, use the primary scope:

```
feat(admin-ui): add identity search with backend integration

Updates both frontend search component and backend search endpoint.

bd: TASK-234
```

If the changes are truly independent, make separate commits for each scope.
