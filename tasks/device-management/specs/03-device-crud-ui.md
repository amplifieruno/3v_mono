# Spec 03: Device Resource (CRUD UI)

## Objective

Create the device resource with List, Create, and Edit pages following the existing facility/area pattern.

## Dependencies

- Spec 02 (GraphQL Operations) must be completed first

## Files to Create/Modify

### Create

- `apps/admin-ui/src/resources/device/resourceConfig.tsx` — Refine resource config
- `apps/admin-ui/src/resources/device/router.tsx` — Route definitions
- `apps/admin-ui/src/resources/device/data/enums.tsx` — Device enums (type, status, health)
- `apps/admin-ui/src/resources/device/pages/list/index.tsx` — List page
- `apps/admin-ui/src/resources/device/pages/list/columns.tsx` — Table columns
- `apps/admin-ui/src/resources/device/pages/create/index.tsx` — Create form
- `apps/admin-ui/src/resources/device/pages/edit/index.tsx` — Edit form

### Modify

- `apps/admin-ui/src/app/App.tsx` — Register device resource + routes
- `apps/admin-ui/src/app/components/appSidebar/NavMenu.tsx` — Fix Devices nav link

## Implementation Details

### 1. Resource Config

```tsx
// resourceConfig.tsx
import { ResourceProps } from '@refinedev/core';
import { MonitorIcon } from 'lucide-react';

export const deviceConfig: ResourceProps = {
  name: 'itap_devices',
  list: '/devices',
  create: '/devices/create',
  edit: '/devices/edit/:id',
  show: '/devices/show/:id',
  meta: {
    label: 'Devices',
    icon: <MonitorIcon />,
    canDelete: true,
  },
};
```

### 2. Enums

```tsx
// data/enums.tsx

export const deviceTypes = [
  { value: 'static_video_camera', label: 'Static Camera', color: 'blue' },
  { value: 'ptz_camera', label: 'PTZ Camera', color: 'purple' },
  { value: 'sensor', label: 'Sensor', color: 'gray' },
];

export const deviceStatuses = [
  { value: 'active', label: 'Active', color: 'green' },
  { value: 'inactive', label: 'Inactive', color: 'gray' },
  { value: 'error', label: 'Error', color: 'red' },
  { value: 'maintenance', label: 'Maintenance', color: 'yellow' },
];

export const healthStatuses = [
  { value: 'healthy', label: 'Healthy', color: 'green' },
  { value: 'warning', label: 'Warning', color: 'yellow' },
  { value: 'critical', label: 'Critical', color: 'red' },
  { value: 'unknown', label: 'Unknown', color: 'gray' },
];
```

### 3. List Page

Table columns:
- **Name** — clickable link to Show page
- **Type** — badge from deviceTypes enum
- **Area** — area name (with facility in tooltip or subtitle)
- **Stream URL** — truncated, monospace
- **Status** — colored badge
- **Health** — colored badge
- **Last Seen** — relative time (e.g., "2 min ago")
- **Actions** — Edit, Delete

Filters:
- Status dropdown
- Device type dropdown
- Area/Facility filter (optional, if easy with Refine)

### 4. Create Page

Form fields:
- **Name** (text, required)
- **Device Type** (select from enum, required, default: `static_video_camera`)
- **Area** (select, required — grouped by facility for easy navigation)
- **Stream URL** (text, optional — placeholder: `rtsp://host:8554/stream`)
- **Resolution** (text, optional, default: `1920x1080`)
- **FPS** (number, optional, default: 30)
- **Status** (select from enum, default: `inactive`)
- **Configuration** (JSON editor or textarea, optional)

Credentials (username/password) fields should be included but marked as optional.

### 5. Edit Page

Same fields as Create, pre-populated with existing values. Show `created_at` and `updated_at` as read-only info.

### 6. Nav Menu Fix

In `NavMenu.tsx`, change the Devices `NavLink to` from `'/'` to `'/devices'`.

### 7. App.tsx Registration

Add `deviceConfig` to resources array and device routes.

## Acceptance Criteria

- [ ] Device List page shows all devices with proper columns and badges
- [ ] Create page allows adding new devices with all fields
- [ ] Edit page allows modifying existing devices
- [ ] Area selector shows areas grouped by facility
- [ ] Navigation "Devices" link goes to `/devices`
- [ ] Delete works from the list page
- [ ] Quality gates pass (pnpm lint, pnpm typecheck, pnpm build)
