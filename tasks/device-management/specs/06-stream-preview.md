# Spec 06: Stream Preview Component

## Objective

Create a reusable stream preview component that embeds a live WebRTC video feed from MediaMTX into the device Show page.

## Dependencies

- Spec 04 (Show Page) — placeholder to replace
- Spec 05 (Virtual Camera) — provides the actual streams

## Files to Create/Modify

### Create

- `apps/admin-ui/src/resources/device/components/StreamPreview.tsx` — Stream preview component

### Modify

- `apps/admin-ui/src/resources/device/pages/show/index.tsx` — Replace placeholder with real component

## Implementation Details

### 1. StreamPreview Component

The component receives a `streamUrl` (RTSP URL like `rtsp://localhost:8554/entrance-cam`) and converts it to the MediaMTX WebRTC URL for embedding.

```tsx
interface StreamPreviewProps {
  streamUrl: string | null;
  deviceName: string;
  status: string;
}
```

**Behavior:**

1. **No stream URL**: Show "No stream configured" with a camera-off icon
2. **Device inactive/error/maintenance**: Show status message, don't attempt connection
3. **Active device with URL**:
   - Parse the RTSP URL to extract the stream path
   - Convert to WebRTC URL: `rtsp://host:8554/path` → `http://host:8889/path`
   - Embed via iframe with 16:9 aspect ratio
   - Show loading state while iframe loads
   - Show error state if connection fails (iframe onerror or timeout)

**URL Conversion Logic:**
```typescript
function rtspToWebrtcUrl(rtspUrl: string): string {
  // rtsp://hostname:8554/stream-name → http://hostname:8889/stream-name
  const url = new URL(rtspUrl.replace('rtsp://', 'http://'));
  url.port = '8889';  // MediaMTX WebRTC port
  return url.toString();
}
```

Note: For local dev, the MediaMTX host should be configurable via environment variable (e.g., `VITE_MEDIAMTX_HOST=localhost`). Default to extracting from the RTSP URL.

### 2. Fallback / Error States

- **Connection timeout (5s)**: Show "Unable to connect to stream" with retry button
- **MediaMTX not running**: Show "Stream server unavailable"
- **Generic iframe**: Use a wrapper div with `aspect-video` (TailwindCSS) for consistent 16:9

### 3. UI Design

```
┌─────────────────────────────────────────┐
│                                         │
│        [Live Video Feed / WebRTC]       │
│              16:9 aspect ratio          │
│           via iframe or JS API          │
│                                         │
├─────────────────────────────────────────┤
│ 🟢 Live  |  entrance-cam  |  1080p 30fps│
└─────────────────────────────────────────┘
```

Below the video:
- Connection status indicator (green dot = live, red = error, gray = inactive)
- Stream name
- Resolution and FPS from device settings

### 4. Environment Configuration

Add to `.env` or Vite config:
```
VITE_MEDIAMTX_WEBRTC_BASE=http://localhost:8889
```

This allows overriding the WebRTC base URL without parsing RTSP URLs, which is more reliable for different deployment scenarios.

## Acceptance Criteria

- [ ] StreamPreview component renders video from MediaMTX WebRTC
- [ ] Proper fallback states for missing URL, inactive device, connection error
- [ ] 16:9 aspect ratio maintained
- [ ] Status indicator shows connection state
- [ ] Works with virtual camera streams from Spec 05
- [ ] No CORS issues in dev environment
- [ ] Quality gates pass
