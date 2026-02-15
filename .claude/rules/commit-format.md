---
paths:
  - ".git/**"
---

# Commit Message Conventions

## Format

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

## Types

- `feat` -- A new feature or capability
- `fix` -- A bug fix
- `refactor` -- Code restructuring without changing behavior
- `perf` -- Performance improvement
- `test` -- Adding or updating tests
- `docs` -- Documentation changes only
- `chore` -- Build, tooling, dependency updates, or other maintenance

## Scopes

- `ui` -- Frontend React application
- `backend` -- Express API server or serverless functions
- `hasura` -- Hasura metadata, migrations, or permissions
- `shared` -- Shared packages (types, utilities)
- `docker` -- Docker and container configuration
- `ci` -- CI/CD pipelines and automation
- `docs` -- Documentation files

## Subject Line Rules

- Use imperative mood ("add feature" not "added feature" or "adds feature").
- Maximum 70 characters.
- No period at the end.
- Lowercase first letter after the colon.

## Body

- Separate from subject with a blank line.
- Explain what and why, not how.
- Wrap at 72 characters.

## Footer

- Reference bd issues: `Closes mono-xxx`
- AI attribution is mandatory when Claude assists:

```
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

## Language

- All commit messages must be in English.

## Examples

```
feat(ui): add identity search with face upload

Implement the identity search page allowing users to upload
a photo and find matching identities via the face recognition
service.

Closes mono-42

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

```
fix(hasura): correct permissions for viewer role on identities table

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```
