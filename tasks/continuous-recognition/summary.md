# Continuous Recognition - Summary

## Status: COMPLETE

## What Was Done

### Data Model (Hasura)
- Added `recognition_enabled` (boolean) and `recognition_fps` (integer, 1-5) columns to `itap.devices`
- Created `itap.detections` table for detection event logging (device_id FK, identity_id FK, confidence, similarity, is_new_identity, bbox, thumbnail)
- Configured Hasura metadata: permissions, relationships, array/object relationships
- Generated GraphQL types via codegen

### Backend (Express + Socket.io)
- Created `RecognitionManager` singleton service with per-device `RecognitionSession` instances
- ffmpeg RTSP frame capture with JPEG SOI/EOI marker parsing for frame extraction
- InsightFace REST API integration for face detection + 512D embedding extraction
- Identity matching via pgvector cosine similarity (threshold 0.50)
- Detection logging via Hasura GraphQL mutations
- WebSocket events: `detection`, `recognition:status`, `recognition:started/stopped/error`
- REST API endpoints: GET/POST `/api/recognition/status[/:deviceId]`, `/api/recognition/start/:deviceId`, `/api/recognition/stop/:deviceId`
- 10-second polling for `recognition_enabled` changes in database
- TCP RTSP transport for reliable frame capture
- Docker hostname resolution (mediamtx -> localhost for local dev)
- Graceful ffmpeg spawn error handling (prevents backend crash)

### Frontend (React + shadcn/ui)
- `RecognitionToggle` component: on/off switch with FPS selector (1-5), backend status polling
- `RecognitionStatus` component: overlay badge showing "Recognition Active" with pulsing green dot
- `LiveDetections` component: recent faces strip with avatars, detection history table with timestamps, face thumbnails, identity links, confidence scores, NEW badges
- Socket.io integration for real-time detection updates
- Integrated all components into device show page

### Infrastructure
- Fixed InsightFace REST Docker container: upgraded Python 3.8 -> 3.10, onnxruntime 1.16.3 -> 1.18.1, fixed apt packages
- Added `seccomp=unconfined` to InsightFace Docker service for ONNX runtime compatibility
- Added `VITE_BACKEND_URL` env var for frontend-backend connectivity

## Files Changed

### Created
- `apps/nhost/nhost/migrations/default/1771189302008_add_device_recognition_columns/up.sql`
- `apps/nhost/nhost/migrations/default/1771189302008_add_device_recognition_columns/down.sql`
- `apps/nhost/nhost/migrations/default/1771189302009_create_table_itap_detections/up.sql`
- `apps/nhost/nhost/migrations/default/1771189302009_create_table_itap_detections/down.sql`
- `apps/nhost/nhost/metadata/databases/default/tables/itap_detections.yaml`
- `apps/backend/src/services/recognitionManager.ts`
- `apps/backend/src/routes/recognition.ts`
- `apps/admin-ui/src/resources/device/components/RecognitionToggle.tsx`
- `apps/admin-ui/src/resources/device/components/LiveDetections.tsx`
- `apps/admin-ui/src/resources/device/components/RecognitionStatus.tsx`

### Modified
- `apps/nhost/nhost/metadata/databases/default/tables/itap_devices.yaml` -- added recognition columns to permissions, added detections relationship
- `apps/nhost/nhost/metadata/databases/default/tables/tables.yaml` -- added itap_detections include
- `apps/admin-ui/src/resources/device/queries.ts` -- added recognition fields and DeviceDetectionsQuery
- `apps/admin-ui/src/resources/device/pages/show/index.tsx` -- integrated recognition components
- `apps/backend/src/index.ts` -- registered recognition routes, socket events, lifecycle hooks
- `apps/backend/.env` -- added Hasura config vars
- `docker/docker-compose.dev.yml` -- seccomp=unconfined for InsightFace
- `libs/InsightFace-REST/dockerfiles/Dockerfile_cpu` -- Python 3.10, fixed deps
- `libs/InsightFace-REST/requirements.txt` -- onnxruntime 1.18.1

## Quality Gates
- [x] Frontend builds successfully (`pnpm build`)
- [x] TypeScript type checking passes (no new errors)
- [x] Playwright visual verification passed

## Demo
- Video: `playwright-output/continuous-recognition-demo.webm`
- Shows: Login -> Dashboard (identity counts) -> Devices -> Lobby PTZ Camera (live stream, recognition toggle ON, live detections with face thumbnails, detection history table) -> Identities list -> Identity detail -> Dashboard

## Key Metrics (from demo session)
- 1500+ frames processed
- 2400+ faces detected
- 90+ identities created/matched
- Recognition pipeline: ~200ms per frame (InsightFace + pgvector matching)

## Architecture
```
MediaMTX (RTSP streams)
  -> Backend ffmpeg (TCP transport, JPEG frame capture)
    -> InsightFace REST (face detection + 512D embeddings)
      -> identityService (pgvector cosine similarity search)
        -> PostgreSQL (identities + detections tables)
          -> WebSocket (real-time UI updates)
            -> React frontend (live detections, status badges)
```

## Notes
- InsightFace requires Python 3.10+ due to union type syntax (`X | Y`) in schemas
- onnxruntime 1.16.x has "cannot enable executable stack" issue on newer kernels; 1.18.1 works
- TCP RTSP transport is required for reliable frame capture from MediaMTX
- Docker hostname `mediamtx` needs resolution to `localhost` when backend runs locally
- Initial InsightFace requests may fail with pickle errors (warmup); resolves after 2-3 frames
