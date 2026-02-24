# Spec 04: Backend — Snapshot-based Recognition

## Goal

Replace ffmpeg/RTSP frame capture with HTTP snapshot fetching. The backend calls `GET /streams/:id/snapshot.jpg` on the stream server — same as a real IP camera snapshot endpoint. Backend does NOT know the stream is fake.

## Current Behavior

`recognitionManager.ts` — `RecognitionSession`:
1. Spawns ffmpeg process: `ffmpeg -rtsp_transport tcp -i rtsp://mediamtx:8554/entrance -vf fps=1 -f image2pipe ...`
2. Reads JPEG frames from stdout pipe continuously
3. Manages buffer, detects JPEG boundaries (0xFF 0xD9)
4. Sends each frame to InsightFace
5. Handles process lifecycle, retries, errors

Problems: ffmpeg as long-running subprocess, RTSP dependency, buffer management, process cleanup.

## New Behavior

`RecognitionSession` becomes simpler:
1. **Timer-based**: `setInterval` at configured fps (e.g., every 1000ms for 1fps)
2. **HTTP fetch**: `GET http://stream-server:8888/streams/{stream_id}/snapshot.jpg`
3. **Process frame**: Send JPEG buffer to InsightFace (same as before)
4. **No ffmpeg**: No subprocess, no buffer management, no RTSP

### Extract stream ID from `stream_url`

Device has `stream_url: "rtsp://mediamtx:8554/entrance"`. We extract `entrance` as the stream ID:

```typescript
function extractStreamId(streamUrl: string): string {
  try {
    const url = new URL(streamUrl);
    return url.pathname.replace(/^\//, '');
  } catch {
    const match = streamUrl.match(/\/([^/]+)$/);
    return match?.[1] ?? streamUrl;
  }
}
```

### New `RecognitionSession` implementation

Key changes to `RecognitionSession`:

```typescript
// New env var
const STREAM_SERVER_URL = process.env.STREAM_SERVER_URL || 'http://localhost:8888'

class RecognitionSession {
  // REMOVE: ffmpegProcess, buffer management, findJpegEnd
  // ADD: fetchInterval, snapshotUrl
  private fetchInterval: NodeJS.Timeout | null = null
  private isProcessing = false
  private _isRunning = false
  private snapshotUrl: string

  constructor(
    readonly deviceId: string,
    readonly deviceName: string,
    private streamUrl: string,
    private fps: number,
    private io: Server | null,
  ) {
    const streamId = extractStreamId(streamUrl)
    this.snapshotUrl = `${STREAM_SERVER_URL}/streams/${streamId}/snapshot.jpg`
    // ... stats init same as before
  }

  start(): void {
    if (this._isRunning) return
    this._isRunning = true

    const intervalMs = Math.max(1000 / this.fps, 500) // Min 500ms between frames

    console.log(`[Recognition] Starting snapshot polling for ${this.deviceName}`)
    console.log(`[Recognition] URL: ${this.snapshotUrl}, interval: ${intervalMs}ms`)

    // Fetch frames on interval
    this.fetchInterval = setInterval(() => this.fetchSnapshot(), intervalMs)

    // Status emission (same as before)
    this.statusInterval = setInterval(() => { ... }, STATUS_EMIT_INTERVAL_MS)

    this.io?.to(`device:${this.deviceId}`).emit('recognition:started', { ... })
  }

  stop(): void {
    this._isRunning = false
    if (this.fetchInterval) {
      clearInterval(this.fetchInterval)
      this.fetchInterval = null
    }
    // ... statusInterval cleanup, emit recognition:stopped (same as before)
  }

  private async fetchSnapshot(): Promise<void> {
    if (this.isProcessing || !this._isRunning) return
    this.isProcessing = true

    try {
      const response = await fetch(this.snapshotUrl)
      if (!response.ok) {
        throw new Error(`Snapshot HTTP ${response.status}`)
      }
      const buffer = Buffer.from(await response.arrayBuffer())
      await this.processFrame(buffer)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (!msg.startsWith('Frame dropped')) {
        this.stats.errors++
        console.error(`[Recognition] Snapshot error for ${this.deviceId}: ${msg}`)
      }
    } finally {
      this.isProcessing = false
    }
  }

  // processFrame() — UNCHANGED from current implementation
  // It receives a JPEG buffer, sends to InsightFace, handles identities
}
```

### What stays the same

- `processFrame()` — identical (receives Buffer, sends to InsightFace)
- `logDetection()` — identical
- `RecognitionManager` — identical (polls Hasura for active devices, manages sessions)
- Socket.io events — identical
- InsightFace integration — identical
- Identity matching — identical

### What gets removed

- `findJpegEnd()` helper function — no longer needed
- ffmpeg process management (spawn, stdout pipe, stderr handling)
- Buffer accumulation and JPEG boundary detection
- `handleFfmpegExit()` and retry logic for ffmpeg crashes
- `RTSP_HOST` env var usage

### What gets added

- `STREAM_SERVER_URL` env var
- `extractStreamId()` helper
- `fetchSnapshot()` method using HTTP fetch
- Timer-based interval instead of ffmpeg pipe

## Environment Variables

| Remove | Add |
|--------|-----|
| `RTSP_HOST` | `STREAM_SERVER_URL` |

Values:
- Dev (docker): `http://stream-server:8888`
- Dev (local): `http://localhost:8888`
- Prod: `http://stream-server:8888` (internal Docker network)

## Files

| Action | Path |
|--------|------|
| Modify | `apps/backend/src/services/recognitionManager.ts` — rewrite session to use HTTP snapshots |
