# Task: Device Management

## Goal

Implement a fully functional Device Management section in the admin UI, including:
- Full CRUD for devices (cameras) via Hasura
- All device properties from the functional spec (type, status, health, stream URL, config, etc.)
- Area/Facility association
- Virtual camera simulator (via MediaMTX + FFmpeg Docker container) for demo purposes
- Live video stream preview in the UI (via WebRTC from MediaMTX)
- Device health metrics display

## Context

- **Functional Spec**: `docs/base/Functional_Specification.md` Section 8 — Device Management
- **Stage 2**: `docs/stages/SA_2_EN.md` Section 2.1.5 — Device Integration
- **Stage 3**: `docs/stages/SA_3_EN.md` Section 2.1.5 — Facility/Area Management System (area-device associations)

Devices are the data collection backbone of ITAP. For the demo, we don't need real camera hardware — we use MediaMTX to loop video files as virtual RTSP cameras and serve them via WebRTC to the browser.

### Current State

- **DB/Hasura**: No `devices` or `device_health_metrics` tables exist
- **UI**: Navigation menu has a "Devices" item but it links to `/` (non-functional)
- **Backend**: No device-related endpoints
- **Dependencies already done**: Facilities ✅, Areas ✅ (devices FK → areas)

## Scope

### Included

- Hasura migration for `itap_devices` and `itap_device_health_metrics` tables
- Hasura metadata (permissions, relationships)
- GraphQL operations + codegen
- Device resource pages: List, Create, Edit, Show
- Device type/status/health enums with proper UI display
- Area selector in device forms (with facility context)
- Virtual camera infrastructure (MediaMTX Docker container + sample videos)
- Live stream preview component (WebRTC iframe or JS API from MediaMTX)
- Device health metrics display on the Show page
- Dashboard integration (device count/status metrics)
- Seed data for demo devices

### NOT Included

- Real camera hardware integration
- Backend face detection from streams (separate task)
- Real-time tracking/movement (separate task)
- Device command & control (over-engineered for demo)
- Certificate management / OTA updates (production concerns)
- Recording capabilities (not needed for demo)

## Technical Approach

### Data Layer
1. Create Hasura migrations for `itap_devices` and `itap_device_health_metrics`
2. Configure Hasura metadata: permissions, relationships (device → area, area → devices)
3. Generate GraphQL types via codegen

### Frontend
4. Create device resource following the facility/area pattern
5. Implement List page with filtering by status, type, area
6. Implement Create/Edit forms with area selection (grouped by facility)
7. Implement Show page with device details + stream preview + health metrics
8. Update navigation and dashboard

### Virtual Camera
9. Add MediaMTX to Docker Compose with FFmpeg looping sample videos
10. Configure 2-3 virtual camera streams
11. Embed WebRTC player in device Show page

### Architecture

```
[Sample MP4s] → [FFmpeg loop] → [MediaMTX container]
                                     |
                                     ├─ RTSP :8554 (for future backend use)
                                     └─ WebRTC :8889 (for browser playback)

[Browser] → <iframe src="http://mediamtx:8889/cam1"> or JS API
```

## Decomposition

| # | Spec | Scope | Est. |
|---|------|-------|------|
| 01 | Data Model & Hasura | Migrations, metadata, permissions, relationships | 30 min |
| 02 | GraphQL Operations | Queries, mutations, codegen, shared types | 20 min |
| 03 | Device Resource (CRUD UI) | List, Create, Edit pages following facility pattern | 45 min |
| 04 | Device Show Page | Detail view with all fields, stream preview placeholder, health | 30 min |
| 05 | Virtual Camera Infrastructure | MediaMTX Docker setup, sample videos, config | 30 min |
| 06 | Stream Preview Component | WebRTC embed, connection status, fallback UI | 25 min |
| 07 | Integration & Polish | Nav fix, dashboard metrics, seed data, testing | 20 min |
