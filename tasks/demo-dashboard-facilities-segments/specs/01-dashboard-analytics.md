# Spec 01: Dashboard & Analytics

## Objective

Create a dashboard landing page that provides an at-a-glance overview of the platform: key metrics, recent activity, and trend charts. This replaces the current empty redirect to the identity list.

## Data Requirements

No new database tables needed. The dashboard aggregates data from existing and new tables using Hasura aggregation queries and computed fields.

### Metrics to Display

| Metric | Source | Query |
|--------|--------|-------|
| Total Identities | `itap_identities_aggregate` | `count` |
| Total Profiles | `itap_profiles_aggregate` | `count` |
| Verified Identities | `itap_identities_aggregate` with `where: {status: {_eq: "verified"}}` | `count` |
| Linked Profiles | `itap_identities_aggregate` with `where: {profile_id: {_is_null: false}}` | `count` |
| Total Facilities | `itap_facilities_aggregate` | `count` (after spec-02) |
| Total Segments | `itap_segments_aggregate` | `count` (after spec-03) |

### Charts Data

**Identity Growth (last 30 days):**
- Query identities grouped by `created_at` date
- Use Hasura's date truncation or fetch all and group client-side (demo approach)

**Identity Status Distribution:**
- Aggregate by status field (verified / unverified)

**Recent Detections (last 10):**
- Query latest identities ordered by `created_at desc`, limit 10
- Display with profile info if linked

## Files to Create

### New Files

```
apps/admin-ui/src/app/pages/dashboard/
├── index.tsx                    # Main dashboard page
├── components/
│   ├── MetricCard.tsx           # Reusable metric card component
│   ├── IdentityGrowthChart.tsx  # Line/area chart for growth trend
│   ├── StatusDistribution.tsx   # Pie/donut chart for status breakdown
│   ├── RecentActivity.tsx       # Table of recent detections/identities
│   └── SystemStatus.tsx         # Service status indicators
└── queries.ts                   # Dashboard-specific GraphQL queries
```

### Files to Modify

```
apps/admin-ui/src/app/App.tsx
  - Uncomment/add dashboard route as index route
  - Import DashboardPage

apps/admin-ui/src/app/components/appSidebar/NavMenu.tsx
  - Update Dashboard nav item to link to actual page (remove placeholder)
```

## Implementation Details

### 1. Install Recharts

```bash
cd apps/admin-ui && pnpm add recharts
```

Recharts is a lightweight React charting library. No heavy dependencies.

### 2. Dashboard Page Layout

```
┌─────────────────────────────────────────────────┐
│ Dashboard                                        │
├──────────┬──────────┬──────────┬────────────────┤
│ Total    │ Total    │ Verified │ Linked         │
│ Identit. │ Profiles │ Identit. │ Profiles       │
│ 156      │ 42       │ 89       │ 38             │
├──────────┴──────────┴──────────┴────────────────┤
│                                                   │
│  Identity Growth (30 days)    Status Distribution │
│  ┌─────────────────────┐     ┌──────────────┐   │
│  │ ▁▂▃▅▆▇ area chart   │     │  ◕ pie chart │   │
│  └─────────────────────┘     └──────────────┘   │
│                                                   │
├─────────────────────────────────────────────────┤
│ Recent Activity                                   │
│ ┌─────────────────────────────────────────────┐ │
│ │ Avatar | Name/ID | Status | Time            │ │
│ │ ...    | ...     | ...    | ...             │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### 3. MetricCard Component

```tsx
interface MetricCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  description?: string;
  trend?: { value: number; isPositive: boolean };
}
```

Uses shadcn/ui `Card` with:
- Icon in top-left
- Title as muted label
- Large value number
- Optional trend indicator (arrow up/down with percentage)

### 4. GraphQL Queries

```graphql
# Dashboard aggregate query — single request for all metrics
query DashboardMetrics {
  identities_total: itap_identities_aggregate {
    aggregate { count }
  }
  identities_verified: itap_identities_aggregate(
    where: { status: { _eq: "verified" } }
  ) {
    aggregate { count }
  }
  identities_linked: itap_identities_aggregate(
    where: { profile_id: { _is_null: false } }
  ) {
    aggregate { count }
  }
  profiles_total: itap_profiles_aggregate {
    aggregate { count }
  }
  recent_identities: itap_identities(
    order_by: { created_at: desc }
    limit: 10
  ) {
    id
    status
    created_at
    images
    profile {
      first_name
      last_name
    }
  }
}
```

### 5. Chart Components

**IdentityGrowthChart:** Recharts `AreaChart` with:
- X-axis: dates (last 30 days)
- Y-axis: cumulative identity count
- Gradient fill
- Responsive container

**StatusDistribution:** Recharts `PieChart` with:
- Two segments: verified (green) / unverified (yellow)
- Center label with total
- Legend below

### 6. RecentActivity Component

Simple table (not DataTable — no pagination needed) showing:
- First image thumbnail (or placeholder avatar)
- Profile name or "Unknown Identity"
- Status badge (verified/unverified)
- Relative time ("2 hours ago")

### 7. SystemStatus Component

Simple status indicators for key services:
- Database: always "online" (if page loads, DB works)
- Face Recognition: check via `/api/face/status` endpoint
- Real-time: Socket.io connection status

### 8. Route Integration

In `App.tsx`, replace the `NavigateToResource` index route with:

```tsx
<Route index element={<DashboardPage />} />
```

## Acceptance Criteria

- [ ] Dashboard is the default landing page after login
- [ ] 4 metric cards display correct counts from database
- [ ] Identity growth chart renders with last 30 days of data
- [ ] Status distribution chart shows verified vs unverified breakdown
- [ ] Recent activity table shows last 10 identities with profile info
- [ ] System status shows service health
- [ ] Dashboard is responsive (works on different screen sizes)
- [ ] Sidebar "Dashboard" link navigates to the dashboard
- [ ] All data is fetched via Hasura GraphQL (no direct DB queries)
- [ ] Quality gates pass: `pnpm lint`, `pnpm typecheck`
- [ ] No `any` types, no inline styles
