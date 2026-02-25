# Spec 02: Identity List Improvements

## Summary

Make identity rows clickable to navigate to the Show page. Currently the only way to view an identity is through the Edit button.

## Files to Modify

| File | Action |
|------|--------|
| `resources/identity/pages/list/columns.tsx` | **Modify** — add clickable links |

## Changes

### 1. ID Column — Clickable Link

Currently shows truncated UUID as plain text. Change to a link:

```tsx
// Before: plain text
<span>{row.id.substring(0, 8)}...</span>

// After: link to show page
<Link to={`/identities/show/${row.id}`} className="text-primary hover:underline">
  {row.id.substring(0, 8)}...
</Link>
```

### 2. Images Column — Clickable

Wrap the existing `IdentityImages` avatar group in a link to the Show page:

```tsx
<Link to={`/identities/show/${row.id}`}>
  <IdentityImages images={row.images} />
</Link>
```

### 3. Add Show Button to Actions

Currently only has Edit and Delete. Add a Show (eye icon) button:

```tsx
<Link to={`/identities/show/${row.id}`}>
  <EyeIcon className="h-4 w-4" />
  Show
</Link>
```

## Technical Notes

- Keep the existing Edit and Delete actions
- Show button should be first in the actions group (consistent with Device list)
- No data model changes needed
