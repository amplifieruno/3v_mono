# Continuous Video Recognition

## Goal

Add background face recognition processing for device camera streams. When enabled on a device, the system continuously captures frames from the RTSP stream, detects faces via InsightFace, and creates/matches identities — using the same pipeline as the Detection Debug page, but running automatically in the background.

## Context

Currently face detection only works in two modes:
1. **Detection Debug page** — uses local webcam, manual snapshot or real-time mode via WebSocket
2. **FaceScannerModal** — uses Human library for profile enrollment (5-angle capture)

Neither mode works with the device camera streams (RTSP via MediaMTX). This task bridges the gap: device cameras should be able to run face recognition continuously, creating and tracking identities automatically.

## User Stories

### US-1: Enable recognition on a device
As an admin, I want to toggle "Face Recognition" on a device's Show page so that the system starts processing the camera stream for faces.

**Acceptance criteria:**
- Toggle/checkbox on the Device Show page (near the Stream Preview)
- When enabled, backend starts capturing frames from the device's RTSP stream
- When disabled, backend stops processing
- Visual indicator showing recognition is active (e.g., pulsing icon, detection count)

### US-2: See live detections
As an admin, I want to see faces being detected in real-time on the Stream Preview so that I can verify recognition is working.

**Acceptance criteria:**
- When recognition is active, show detected faces count and latest detections
- Show thumbnails of recently detected/recognized faces below the stream
- Link detected faces to their Identity records

### US-3: Background processing without browser
As an admin, I want recognition to keep running even when I close the browser, so that the system tracks identities 24/7.

**Acceptance criteria:**
- Recognition runs server-side, not in the browser
- State persists across page reloads (backend tracks which devices have recognition enabled)
- Can see accumulated results when returning to the device page

## Architecture

### Frame Capture Pipeline

```
MediaMTX (RTSP) --> Backend (ffmpeg frame capture) --> InsightFace REST API
                                                            |
                                                            v
                                                    identityService
                                                    (find or create)
                                                            |
                                                            v
                                                    PostgreSQL + pgvector
                                                            |
                                                            v
                                                    WebSocket --> Frontend
                                                    (live results)
```

### Key Design Decisions

1. **Server-side capture via ffmpeg** — Backend spawns ffmpeg process to capture frames from the RTSP stream at configurable FPS (1-3 fps). This works without a browser and is the same approach MediaMTX uses internally.

2. **Reuse existing identityService** — Same `findOrCreateIdentity()` + pgvector similarity search. No new identity logic needed.

3. **Reuse existing InsightFace REST** — Same `/extract` endpoint for face detection + 512D embeddings. Already running in Docker.

4. **Device-level toggle** — Store `recognition_enabled` flag on the device record. Backend watches this field and starts/stops processing accordingly.

5. **WebSocket for live results** — Emit detection events to connected clients viewing the device. Same Socket.io infrastructure as detection debug.

## Database Changes

- Add `recognition_enabled: boolean` column to `itap_devices` (default: false)
- Add `recognition_fps: integer` column to `itap_devices` (default: 2, range 1-5)
- Consider a `itap_detections` table for logging each detection event (timestamp, device_id, identity_id, confidence, bbox)

## Implementation Approach

### Backend
1. **RecognitionManager** service — manages active recognition sessions per device
2. **Frame capture** — ffmpeg subprocess: `ffmpeg -i rtsp://mediamtx:8554/{path} -vf fps=2 -f image2pipe -vcodec mjpeg pipe:1`
3. **Processing loop** — capture frame -> send to InsightFace -> findOrCreateIdentity -> emit via WebSocket
4. **Lifecycle** — on backend startup, query devices with `recognition_enabled=true` and start processing; watch for changes via Hasura event triggers or polling

### Frontend
1. **Toggle button** on Device Show page — calls mutation to set `recognition_enabled`
2. **Live detections panel** below Stream Preview — shows recent face detections with thumbnails
3. **Recognition status indicator** — shows FPS, total detections, active/inactive state
4. **Detection history** — table of recent detections with links to Identity records

## Dependencies

- MediaMTX running with RTSP streams (done)
- InsightFace REST API running (Docker container)
- Backend with identityService + WebSocket (exists)
- Device CRUD with stream_url (done)

## Specs

| # | Spec | Description | Key deliverables |
|---|------|-------------|------------------|
| 01 | [Data Model & Hasura](specs/01-data-model.md) | Database schema changes + Hasura metadata | `recognition_enabled`/`recognition_fps` columns on `itap_devices`, new `itap_detections` table, permissions, GraphQL queries |
| 02 | [Recognition Service](specs/02-recognition-service.md) | Backend frame capture + processing | `RecognitionManager` singleton, ffmpeg RTSP→JPEG pipe, InsightFace + identityService pipeline, WebSocket events, REST API |
| 03 | [Frontend UI](specs/03-frontend-ui.md) | Device Show page recognition controls | Toggle + FPS selector, live detections panel with face thumbnails, status indicator, Socket.io integration |

### Execution Order

```
Spec 01 (Data Model)
    ↓
Spec 02 (Backend Service)  ← depends on schema
    ↓
Spec 03 (Frontend UI)      ← depends on backend API + WS events
```

Specs 02 and 03 could partially overlap (frontend can be scaffolded while backend is in progress), but full integration testing requires all three.

## Notes

- For the demo, 1-2 FPS is sufficient — we want to show it works, not process every frame
- The same pipeline should work with real IP cameras once they replace the demo videos
- Consider adding a "detection overlay" on the stream in a future iteration (drawing bboxes on the WebRTC feed)
