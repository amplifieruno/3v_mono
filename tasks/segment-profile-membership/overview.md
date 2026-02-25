# Segment Profile Membership

## Goal

Extend segments to support direct profile membership alongside existing identity membership. Currently segments only group identities (which are often unknown faces). For demo scenarios like "Employees with building access" or "VIP clients", we need to add known people (profiles) to segments directly, without requiring them to have a linked identity.

## Current State

### Segments
- Full CRUD: list, create, edit, show pages
- Two types: `manual` (hand-picked members) and `rule_based` (auto-match via conditions)
- **Only supports identity membership** via `segment_memberships` table (segment_id + identity_id)
- Rule builder filters against `itap_identities` table only
- Show page lists members as identities, showing profile name only if identity has a linked profile

### The Problem
- Profiles (known people) cannot be directly added to segments
- To put "John Doe" into an "Employees" segment, you must: find his identity → add identity to segment
- If a profile has no linked identity yet (e.g., pre-registered employee), there's no way to include them
- Rule-based segments cannot query profiles directly — only identities with profile relationships

## Data Model

```
Current:
  Segment ──< segment_memberships >── Identity ──> Profile (optional)

Desired:
  Segment ──< segment_memberships >── Identity (optional)
           ──< segment_profile_memberships >── Profile
```

A profile can be in multiple segments. An identity can also be in multiple segments. Both membership types coexist independently.

## Scope

1. **New `segment_profile_memberships` table** — join table for segment ↔ profile
2. **Hasura metadata** — relationships, permissions for the new table
3. **Profile rule fields for rule builder** — ability to auto-match profiles
4. **Segment Show page** — show both identity members and profile members in separate tabs/sections
5. **Segment Create/Edit** — ability to manually add/remove profiles; rule-based matching for profiles
6. **Profile Show page** — show which segments a profile belongs to
7. **Segment List** — member count should reflect both identity + profile members

## Out of Scope

- Merging identities and profiles into a single membership table (too disruptive)
- Segment-based access control enforcement (backend logic)
- Notifications based on segment membership changes
- Bulk profile import into segments
