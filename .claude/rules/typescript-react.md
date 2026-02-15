---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# TypeScript and React Code Style

## Formatting

- Use Prettier for all formatting decisions.
- Single quotes for strings.
- 2-space indentation.
- Trailing commas in multi-line structures.
- Semicolons required.

## Variable Declarations

- Use `const` everywhere by default.
- Never use `var`.
- Use `let` only when reassignment is genuinely required.

## Type Safety

- Never use `any`. Use `unknown` with type narrowing instead.
- Prefer explicit return types on exported functions.
- Use discriminated unions over optional fields when modeling variants.
- Use `satisfies` operator when you need both type checking and type inference.

## React Components

- Functional components only. No class components.
- Use arrow function syntax for component definitions.
- Props interface named `{ComponentName}Props`.
- Destructure props in the function signature.

```tsx
const UserCard = ({ name, email }: UserCardProps) => {
  return <div>...</div>;
};
```

## Data Fetching

- Never use `useEffect` for data fetching. Use React Query (TanStack Query) instead.
- All server state must go through React Query hooks.
- Wrap queries in custom hooks (e.g., `useIdentities`, `useProfile`).

## Forms

- Never use raw `useState` for form state. Use react-hook-form with Zod schemas for validation.
- Define the Zod schema first, then derive the TypeScript type from it with `z.infer`.

```tsx
const schema = z.object({ name: z.string().min(1) });
type FormData = z.infer<typeof schema>;
```

## Styling

- Use TailwindCSS v4 utility classes for all styling.
- No inline `style` attributes.
- No CSS modules or styled-components.
- Use `cn()` helper (from `lib/utils`) to merge conditional class names.

## Component Library

- Use shadcn/ui components for all standard UI elements (Button, Input, Dialog, Table, Card, etc.).
- Never use raw HTML elements when a shadcn/ui component exists for that purpose.
- Icons must come from `lucide-react` only. No other icon libraries.

## File Organization

- Maximum file size: 300 lines. If a file exceeds this, split it into smaller modules.
- One component per file.
- Co-locate hooks, types, and utilities with the components that use them.

## Exports

- Use named exports only.
- Exception: page-level components may use default exports for React.lazy() dynamic imports.

```tsx
// Correct
export const UserCard = () => { ... };

// Only for page components used with React.lazy
export default UserProfilePage;
```
