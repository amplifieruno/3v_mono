# Spec 07: Integration & Polish

## Objective

Wire everything together: dashboard metrics, seed data for demo, final navigation fixes, and end-to-end testing.

## Dependencies

- All previous specs (01-06) should be completed

## Files to Create/Modify

### Modify

- `apps/admin-ui/src/pages/dashboard/` — Add device metrics cards
- Hasura seed data (or SQL seed file) — Demo devices

### Possibly Create

- `apps/nhost/nhost/seeds/default/<timestamp>_seed_devices.sql` — Seed data

## Implementation Details

### 1. Dashboard Metrics

Add a device metrics card to the dashboard, following the existing pattern for identities/facilities/segments:

- **Total Devices**: count
- **Online**: count of `status = 'active'` AND `health_status IN ('healthy', 'warning')`
- **Offline/Error**: count of `status IN ('error', 'inactive')`

Use a simple GraphQL aggregate query:
```graphql
query DeviceStats {
  total: itap_devices_aggregate {
    aggregate { count }
  }
  active: itap_devices_aggregate(where: { status: { _eq: "active" } }) {
    aggregate { count }
  }
  error: itap_devices_aggregate(where: { status: { _eq: "error" } }) {
    aggregate { count }
  }
}
```

### 2. Seed Data

Create seed SQL for demo devices that match the virtual camera setup:

```sql
-- Assuming areas already exist from facility/area seeds
INSERT INTO itap.devices (name, device_type, area_id, stream_url, resolution, fps, status, health_status, last_seen) VALUES
('Main Entrance Camera', 'static_video_camera', '<entrance-area-id>', 'rtsp://mediamtx:8554/entrance-cam', '1920x1080', 30, 'active', 'healthy', now()),
('Lobby Camera', 'static_video_camera', '<lobby-area-id>', 'rtsp://mediamtx:8554/lobby-cam', '1920x1080', 25, 'active', 'healthy', now()),
('Parking Lot Camera', 'ptz_camera', '<parking-area-id>', 'rtsp://mediamtx:8554/parking-cam', '2560x1440', 15, 'active', 'warning', now() - interval '5 minutes'),
('Server Room Sensor', 'sensor', '<server-area-id>', NULL, NULL, NULL, 'inactive', 'unknown', NULL),
('Back Door Camera', 'static_video_camera', '<backdoor-area-id>', 'rtsp://mediamtx:8554/entrance-cam', '1280x720', 30, 'maintenance', 'unknown', now() - interval '2 hours');

-- Sample health metrics for active cameras
INSERT INTO itap.device_health_metrics (device_id, timestamp, cpu_usage, memory_usage, disk_usage, network_latency, frame_rate, error_count)
SELECT d.id, now() - (n || ' minutes')::interval,
  20 + random() * 30,   -- CPU 20-50%
  40 + random() * 20,   -- Memory 40-60%
  30 + random() * 10,   -- Disk 30-40%
  5 + random() * 15,    -- Latency 5-20ms
  d.fps - random() * 3, -- Frame rate near target
  CASE WHEN random() > 0.9 THEN 1 ELSE 0 END  -- Occasional errors
FROM itap.devices d,
     generate_series(0, 19) AS n
WHERE d.status = 'active';
```

The actual area IDs will need to be resolved from existing seed data. Use subqueries or variables.

### 3. End-to-End Verification

Using Playwright MCP tools, verify:

1. Navigate to `/devices` — list page loads with seed data
2. Click "Create" — form renders with all fields
3. Fill form and submit — device created
4. Click device name — Show page renders with all sections
5. Stream preview area is visible (even if no actual stream)
6. Navigate back to list — new device appears
7. Edit a device — changes persist
8. Delete a device — removed from list
9. Dashboard shows device metrics

### 4. Final Cleanup

- Ensure all TypeScript types are correct (no `any`)
- Remove any TODO/FIXME comments that were resolved
- Verify all quality gates pass: `pnpm lint`, `pnpm typecheck`, `pnpm build`

## Acceptance Criteria

- [ ] Dashboard shows device count metrics
- [ ] Seed data creates realistic demo devices
- [ ] Seed health metrics provide data for the Show page health section
- [ ] Full CRUD flow works end-to-end (create, read, update, delete)
- [ ] Stream preview shows video when MediaMTX is running
- [ ] All quality gates pass
- [ ] Visual verification via Playwright confirms UI renders correctly
