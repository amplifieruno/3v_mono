---
paths:
  - "**/routes/**"
  - "**/api/**"
---

# API Design Conventions

## When to Use What

- **Simple CRUD operations**: Use Hasura's auto-generated GraphQL API directly. Do not write custom endpoints for basic create, read, update, delete.
- **Complex business logic**: Write custom Express handlers and expose them as Hasura Actions or standalone REST endpoints.
- **Webhooks and events**: Use Hasura Event Triggers that call Express handler endpoints.

## REST URL Structure

- Base path: `/api/v1/<resource>`
- Resource names in kebab-case, plural (e.g., `/api/v1/face-scans`, `/api/v1/identity-matches`).
- Nested resources for clear parent-child relationships: `/api/v1/facilities/:facilityId/areas`.
- No trailing slashes.

## HTTP Methods and Status Codes

| Method | Purpose | Success Code |
|--------|---------|-------------|
| GET | Retrieve resource(s) | 200 |
| POST | Create a resource | 201 |
| PUT | Full replacement | 200 |
| PATCH | Partial update | 200 |
| DELETE | Remove a resource | 204 |

## Error Response Format

All error responses must follow this structure:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description of the error",
    "details": []
  }
}
```

Standard error codes:
- `400` -- Validation error or bad request
- `401` -- Not authenticated
- `403` -- Forbidden (authenticated but not authorized)
- `404` -- Resource not found
- `409` -- Conflict (e.g., duplicate entry)
- `500` -- Internal server error

## Input Validation

- Validate all incoming request data with Zod schemas.
- Define the schema, then use it as middleware or in the handler.
- Return 400 with details from Zod's error formatting on validation failure.

```typescript
const createIdentitySchema = z.object({
  label: z.string().min(1).max(255),
  faceImageBase64: z.string(),
});
```

## Response Conventions

- Return JSON for all endpoints.
- Wrap list responses: `{ "data": [...], "total": number }`.
- Single resource responses: return the object directly or `{ "data": { ... } }`.
- Include `id` and timestamps (`createdAt`, `updatedAt`) in all resource responses.

## Authentication

- Use Nhost/Hasura JWT tokens for authentication.
- Pass JWT in `Authorization: Bearer <token>` header.
- Validate tokens via Nhost SDK or Hasura's built-in JWT verification.
