# Spec 04: Device Show Page

## Objective

Create a detailed Show page for a device displaying all properties, stream preview area, and health metrics.

## Dependencies

- Spec 03 (CRUD UI) must be completed first
- Spec 06 (Stream Preview) will enhance this page later — for now, add a placeholder

## Files to Create/Modify

### Create

- `apps/admin-ui/src/resources/device/pages/show/index.tsx` — Show page

### Modify

- `apps/admin-ui/src/resources/device/router.tsx` — add Show route (if not already)

## Implementation Details

### Page Layout

The Show page should have a clear layout with sections:

#### Section 1: Header
- Device name (large)
- Status badge + Health badge
- Edit button, Delete button
- Last seen: relative time + absolute tooltip

#### Section 2: Stream Preview (placeholder initially)
- Large area (16:9 aspect ratio) showing:
  - If stream URL exists: placeholder text "Stream preview — connect to view" with a play icon
  - If no stream URL: "No stream URL configured"
  - This will be replaced by the real WebRTC player in Spec 06

#### Section 3: Device Details (Card or grid)
- **Type**: with icon/badge
- **Area**: name (linked) + facility name
- **Stream URL**: monospace, copyable
- **Resolution**: e.g., "1920x1080"
- **FPS**: e.g., "30 fps"
- **Configuration**: formatted JSON display (collapsible if large)
- **Created**: timestamp
- **Updated**: timestamp

#### Section 4: Health Metrics (if data exists)
- Small table or cards showing recent metrics:
  - Timestamp | CPU | Memory | Disk | Latency | Frame Rate | Errors
- If no metrics: "No health data available"
- Limit to last 10-20 entries
- Consider a simple sparkline or mini chart for frame rate trend (optional, only if simple)

### Data Fetching

Use the `DEVICE_ONE_QUERY` which includes the area relationship and health_metrics (last 20, ordered by timestamp desc).

## Acceptance Criteria

- [ ] Show page displays all device fields
- [ ] Status and health shown as colored badges
- [ ] Area shown with link to facility
- [ ] Stream preview placeholder area present (16:9)
- [ ] Health metrics table shown when data exists
- [ ] Edit/Delete actions available from Show page
- [ ] Quality gates pass
