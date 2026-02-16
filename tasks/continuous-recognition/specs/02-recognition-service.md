# Spec 02: Backend Recognition Service

## Objective

Create a `RecognitionManager` service that captures frames from device RTSP streams via ffmpeg, sends them to InsightFace for face detection, matches/creates identities, logs detections to the database, and emits real-time results via WebSocket.

## Dependencies

- Spec 01 (Data Model) must be completed first
- InsightFace REST API running (Docker container at `:18080`)
- MediaMTX running with RTSP streams
- Existing `identityService` and `insightFaceService`

## Files to Create/Modify

### Create

- `apps/backend/src/services/recognitionManager.ts` — main service
- `apps/backend/src/routes/recognition.ts` — REST API endpoints

### Modify

- `apps/backend/src/index.ts` — register routes, initialize RecognitionManager on startup

## Implementation Details

### 1. RecognitionManager Service

The `RecognitionManager` is a singleton that manages multiple `RecognitionSession` instances — one per device with `recognition_enabled = true`.

```
RecognitionManager
├── sessions: Map<deviceId, RecognitionSession>
├── initialize() — query DB for active devices, start sessions
├── startSession(device) — create and start a session
├── stopSession(deviceId) — stop and remove a session
├── getStatus() — return status of all sessions
└── shutdown() — stop all sessions gracefully

RecognitionSession
├── deviceId, streamUrl, fps
├── ffmpegProcess: ChildProcess
├── isRunning: boolean
├── stats: { framesProcessed, facesDetected, identitiesCreated, errors, startedAt }
├── start() — spawn ffmpeg, begin processing loop
├── stop() — kill ffmpeg, cleanup
└── processFrame(buffer) — detect faces, match identities, log, emit WS
```

### 2. Frame Capture via ffmpeg

Spawn ffmpeg to capture frames from RTSP at the configured FPS:

```typescript
const args = [
  '-i', streamUrl,           // RTSP input (e.g., rtsp://mediamtx:8554/entrance-cam)
  '-vf', `fps=${fps}`,       // Frame rate filter
  '-f', 'image2pipe',        // Output frames as pipe
  '-vcodec', 'mjpeg',        // JPEG encoding
  '-q:v', '5',               // Quality (2=best, 31=worst). 5 is good enough.
  '-an',                      // No audio
  'pipe:1'                    // Output to stdout
];

const ffmpeg = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
```

**JPEG frame parsing from pipe:**
- JPEG frames start with `0xFF 0xD8` (SOI) and end with `0xFF 0xD9` (EOI)
- Accumulate stdout data in a buffer
- When EOI is found, extract the complete JPEG frame and process it
- This is a well-known pattern for `image2pipe` output

```typescript
let buffer = Buffer.alloc(0);

ffmpeg.stdout.on('data', (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);

  // Find JPEG end marker (0xFF 0xD9)
  let eoiIndex: number;
  while ((eoiIndex = findJpegEnd(buffer)) !== -1) {
    const frame = buffer.subarray(0, eoiIndex + 2);
    buffer = buffer.subarray(eoiIndex + 2);
    this.processFrame(frame);
  }
});
```

**Important**: Use `mediamtx` as hostname (Docker network), not `localhost`. The backend runs in Docker and needs the internal hostname:
```
rtsp://mediamtx:8554/entrance-cam
```

If the device's `stream_url` uses `localhost`, replace it with `mediamtx` for the ffmpeg command.

### 3. Frame Processing Pipeline

For each captured frame:

```typescript
async processFrame(frameBuffer: Buffer): Promise<void> {
  // 1. Skip if previous frame still processing (backpressure)
  if (this.isProcessing) return;
  this.isProcessing = true;

  try {
    // 2. Convert buffer to base64 for InsightFace API
    const base64Image = frameBuffer.toString('base64');

    // 3. Call InsightFace (reuse existing service)
    const result = await insightFaceService.detectFaces(base64Image);

    // 4. For each detected face, find or create identity
    for (const face of result.faces) {
      if (!face.embedding) continue;

      const identityResult = await identityService.findOrCreateIdentity({
        embedding: face.embedding,
        confidence: face.confidence,
        image_data: base64Image,  // for face crop
        x_min: face.x_min,
        y_min: face.y_min,
        x_max: face.x_max,
        y_max: face.y_max,
      });

      // 5. Log detection to database (via Hasura)
      const detection = await this.logDetection({
        device_id: this.deviceId,
        identity_id: identityResult.identity.id,
        confidence: face.confidence,
        similarity: identityResult.similarity,
        is_new_identity: identityResult.isNewIdentity,
        bbox: { x_min: face.x_min, y_min: face.y_min, x_max: face.x_max, y_max: face.y_max },
        thumbnail: face.face_crop || null,  // from insightFaceService
      });

      // 6. Emit via WebSocket
      io.to(`device:${this.deviceId}`).emit('detection', {
        id: detection.id,
        device_id: this.deviceId,
        identity_id: identityResult.identity.id,
        confidence: face.confidence,
        similarity: identityResult.similarity,
        is_new_identity: identityResult.isNewIdentity,
        thumbnail: face.face_crop || null,
        timestamp: new Date().toISOString(),
        identity: {
          id: identityResult.identity.id,
          status: identityResult.identity.status,
          detectionCount: identityResult.identity.attributes?.detectionCount,
        },
      });

      this.stats.facesDetected++;
      if (identityResult.isNewIdentity) this.stats.identitiesCreated++;
    }

    this.stats.framesProcessed++;
  } catch (error) {
    this.stats.errors++;
    console.error(`[Recognition] Error processing frame for device ${this.deviceId}:`, error.message);
  } finally {
    this.isProcessing = false;
  }
}
```

### 4. Detection Logging via Hasura

Use a direct GraphQL mutation to Hasura (admin secret) to insert detections:

```typescript
async logDetection(data: DetectionInput): Promise<{ id: string }> {
  const mutation = `
    mutation InsertDetection($object: itap_detections_insert_input!) {
      insert_itap_detections_one(object: $object) {
        id
      }
    }
  `;

  const response = await fetch(HASURA_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': HASURA_ADMIN_SECRET,
    },
    body: JSON.stringify({
      query: mutation,
      variables: { object: data },
    }),
  });

  const result = await response.json();
  return result.data.insert_itap_detections_one;
}
```

**Environment variables needed:**
- `HASURA_GRAPHQL_URL` — e.g., `http://hasura:8080/v1/graphql`
- `HASURA_ADMIN_SECRET` — from existing env config

### 5. Lifecycle Management

**On startup:**
```typescript
async initialize(): Promise<void> {
  // Query Hasura for all devices with recognition_enabled = true
  const devices = await this.getActiveDevices();
  for (const device of devices) {
    if (device.stream_url) {
      await this.startSession(device);
    }
  }
  console.log(`[Recognition] Started ${this.sessions.size} recognition sessions`);
}
```

**Watching for changes** — Two approaches (choose simplest):

**Option A: Polling (recommended for demo)**
```typescript
// Poll every 10 seconds for changes
setInterval(async () => {
  const activeDevices = await this.getActiveDevices();
  const activeIds = new Set(activeDevices.map(d => d.id));

  // Start new sessions
  for (const device of activeDevices) {
    if (!this.sessions.has(device.id) && device.stream_url) {
      await this.startSession(device);
    }
  }

  // Stop removed sessions
  for (const [deviceId] of this.sessions) {
    if (!activeIds.has(deviceId)) {
      await this.stopSession(deviceId);
    }
  }
}, 10_000);
```

**Option B: Hasura Event Trigger** (more complex, skip for demo)

**On shutdown (SIGTERM):**
```typescript
async shutdown(): Promise<void> {
  for (const [deviceId] of this.sessions) {
    await this.stopSession(deviceId);
  }
}
```

### 6. WebSocket Events

**Room convention**: `device:<deviceId>` — clients join when viewing a device's Show page.

**Server → Client events:**

| Event | Payload | When |
|-------|---------|------|
| `detection` | `{ id, device_id, identity_id, confidence, similarity, is_new_identity, thumbnail, timestamp, identity }` | Each face detected |
| `recognition:status` | `{ device_id, isRunning, stats }` | Every 5 seconds while active |
| `recognition:started` | `{ device_id }` | Session started |
| `recognition:stopped` | `{ device_id }` | Session stopped |
| `recognition:error` | `{ device_id, error }` | Processing error |

**Client → Server events:**

| Event | Payload | Description |
|-------|---------|-------------|
| `join-device` | `{ deviceId }` | Client wants live updates for a device |
| `leave-device` | `{ deviceId }` | Client stops watching a device |

### 7. REST API Endpoints

In `apps/backend/src/routes/recognition.ts`:

```
GET  /api/recognition/status              — Status of all active sessions
GET  /api/recognition/status/:deviceId    — Status of a specific device session
POST /api/recognition/start/:deviceId     — Force-start recognition (alternative to Hasura toggle)
POST /api/recognition/stop/:deviceId      — Force-stop recognition
```

These are convenience endpoints. The primary toggle mechanism is via Hasura mutation (updating `recognition_enabled` on the device), and the polling loop picks up the change. The REST endpoints allow direct control without waiting for the poll interval.

```typescript
router.get('/status', (req, res) => {
  const status = recognitionManager.getStatus();
  res.json(status);
});

router.get('/status/:deviceId', (req, res) => {
  const session = recognitionManager.getSession(req.params.deviceId);
  if (!session) return res.json({ isRunning: false });
  res.json(session.getStatus());
});

router.post('/start/:deviceId', async (req, res) => {
  // Fetch device from Hasura, start session
  // Also update recognition_enabled = true in Hasura
});

router.post('/stop/:deviceId', async (req, res) => {
  // Stop session, update recognition_enabled = false
});
```

### 8. Error Handling & Resilience

- **ffmpeg crash**: If the ffmpeg process exits unexpectedly, log the error and attempt restart after 5 seconds (max 3 retries).
- **InsightFace unavailable**: Skip frame processing, increment error count. Don't crash the session.
- **Backpressure**: If a frame is still being processed when the next frame arrives, drop the new frame. At 2 FPS this shouldn't happen often, but it prevents queue buildup.
- **Memory**: Don't buffer more than 1 frame at a time. The `isProcessing` flag handles this.

### 9. Registration in `index.ts`

```typescript
import recognitionRoutes from './routes/recognition';
import { recognitionManager } from './services/recognitionManager';

// Routes
app.use('/api/recognition', recognitionRoutes);

// After DB + InsightFace init
await recognitionManager.initialize();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await recognitionManager.shutdown();
  // ... existing shutdown logic
});
```

## ffmpeg Availability

The backend runs in Docker. Ensure ffmpeg is available in the backend container. Add to the backend Dockerfile:

```dockerfile
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
```

Or, if using a node:alpine base image:
```dockerfile
RUN apk add --no-cache ffmpeg
```

Check the current backend Dockerfile to determine which approach is needed.

## Acceptance Criteria

- [ ] `RecognitionManager` service created with session lifecycle management
- [ ] ffmpeg frame capture works from RTSP stream
- [ ] JPEG frame parsing correctly extracts individual frames from pipe
- [ ] Frames are sent to InsightFace and faces are detected
- [ ] Detected faces are matched/created via `identityService`
- [ ] Detections are logged to `itap_detections` via Hasura
- [ ] WebSocket events emitted for each detection
- [ ] REST status endpoint returns session info
- [ ] Sessions auto-start on backend startup for enabled devices
- [ ] Polling detects `recognition_enabled` changes within 10 seconds
- [ ] Graceful shutdown stops all ffmpeg processes
- [ ] Backpressure prevents frame queue buildup
- [ ] Quality gates pass (`pnpm lint`, `pnpm typecheck`)
