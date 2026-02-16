# Spec 03: Frontend Recognition UI

## Objective

Add a recognition toggle, live detection panel, and status indicator to the Device Show page. When recognition is enabled, show real-time face detections with thumbnails and identity links.

## Dependencies

- Spec 01 (Data Model) — recognition fields in GraphQL types
- Spec 02 (Recognition Service) — backend must be running to process frames
- Device Show page (already exists at `apps/admin-ui/src/resources/device/pages/show/index.tsx`)

## Files to Create/Modify

### Create

- `apps/admin-ui/src/resources/device/components/RecognitionToggle.tsx` — toggle with FPS control
- `apps/admin-ui/src/resources/device/components/LiveDetections.tsx` — real-time detection panel
- `apps/admin-ui/src/resources/device/components/RecognitionStatus.tsx` — status indicator (active/inactive, stats)

### Modify

- `apps/admin-ui/src/resources/device/pages/show/index.tsx` — integrate new components
- `apps/admin-ui/src/resources/device/queries.ts` — add detection queries (from Spec 01)

## Implementation Details

### 1. RecognitionToggle Component

A card with a switch to enable/disable recognition and a FPS selector.

```typescript
interface RecognitionToggleProps {
  deviceId: string;
  recognitionEnabled: boolean;
  recognitionFps: number;
  streamUrl: string | null;
}
```

**UI layout:**
```
┌─────────────────────────────────────────┐
│ Face Recognition                   [ON] │
│                                         │
│ Capture rate: [1] [2] [3] [4] [5] fps  │
│                                         │
│ ● Processing — 42 faces detected        │
│   Session running for 2h 15m            │
└─────────────────────────────────────────┘
```

**Behavior:**
- Toggle calls `DeviceUpdateOneMutation` with `{ recognition_enabled: true/false }`
- FPS buttons call the same mutation with `{ recognition_fps: N }`
- Disable toggle if `stream_url` is null (show tooltip: "Configure stream URL first")
- When toggling ON, also call `POST /api/recognition/start/:deviceId` for instant start (don't wait for poll)
- When toggling OFF, call `POST /api/recognition/stop/:deviceId` for instant stop

**Status line** (below toggle):
- Fetch from `GET /api/recognition/status/:deviceId`
- Show: running/stopped, frames processed, faces detected, errors
- Poll every 5 seconds when recognition is enabled, or use the `recognition:status` WebSocket event

### 2. LiveDetections Component

A panel showing recently detected faces in real-time via WebSocket.

```typescript
interface LiveDetectionsProps {
  deviceId: string;
  recognitionEnabled: boolean;
}
```

**UI layout:**
```
┌─────────────────────────────────────────┐
│ Live Detections                    [42] │
│                                         │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐   │
│ │ face │ │ face │ │ face │ │ face │   │
│ │ crop │ │ crop │ │ crop │ │ crop │   │
│ └──────┘ └──────┘ └──────┘ └──────┘   │
│ Person#1  Person#2  NEW      Person#1  │
│ 98.5%     95.2%     87.3%    96.1%     │
│ 2s ago    5s ago    12s ago  18s ago   │
│                                         │
│ ─────────── Detection History ───────── │
│                                         │
│ Time       Face    Identity   Conf  New │
│ 14:32:05   [img]   Person#1   98%   No │
│ 14:32:03   [img]   Person#2   95%   No │
│ 14:31:58   [img]   —          87%  Yes │
│ 14:31:55   [img]   Person#1   96%   No │
│ ...                                     │
│                         [View All →]    │
└─────────────────────────────────────────┘
```

**Two sections:**

1. **Recent faces strip** (top): Horizontal scroll of latest ~8 face thumbnails
   - Each shows: thumbnail image, identity label (or "NEW"), confidence %, relative time
   - Click thumbnail → navigate to Identity Show page (if identity exists)
   - New detections slide in from the left with a subtle animation

2. **Detection history table** (bottom): Table of recent detections
   - Columns: Time, Thumbnail, Identity (link), Confidence, New?
   - Initially show last 10, "View All" links to a filtered detections list
   - Load historical data from `DeviceDetectionsQuery` on mount
   - Prepend new detections from WebSocket in real-time

**WebSocket integration:**
```typescript
useEffect(() => {
  if (!recognitionEnabled) return;

  const socket = io(BACKEND_URL);
  socket.emit('join-device', { deviceId });

  socket.on('detection', (data) => {
    setDetections(prev => [data, ...prev].slice(0, 50)); // Keep last 50
  });

  return () => {
    socket.emit('leave-device', { deviceId });
    socket.disconnect();
  };
}, [deviceId, recognitionEnabled]);
```

**When recognition is disabled:**
- Show a muted state: "Enable face recognition to see live detections"
- Still show historical detections from the database (if any)

### 3. RecognitionStatus Component

A small status badge/indicator shown near the stream preview.

```typescript
interface RecognitionStatusProps {
  deviceId: string;
  recognitionEnabled: boolean;
}
```

**UI:**
- When active: Green pulsing dot + "Recognition Active" + face count badge
- When inactive: Gray dot + "Recognition Off"
- Overlay on the StreamPreview card (bottom-right corner, next to the LIVE indicator)

This can be rendered inside the StreamPreview area or as a separate badge below it.

### 4. Integration in Device Show Page

Update the Show page layout to include recognition components:

```
┌─────────────────────────────────────────────────────┐
│ Device Name                          [Edit] [Delete] │
│ ● Active  ♥ Healthy  Last seen: 2 min ago           │
├─────────────────────────────────────────────────────┤
│                                                       │
│  ┌─── Stream Preview ──────────────────────────────┐ │
│  │                                                   │ │
│  │              Live Video Feed                      │ │
│  │                                                   │ │
│  │  [LIVE ●]                    [Recognition ●]     │ │
│  └───────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─── Face Recognition ────┐  ┌─── Device Info ────┐ │
│  │ Toggle [ON/OFF]         │  │ Type: PTZ Camera    │ │
│  │ FPS: [1][2][3][4][5]   │  │ Area: Main Entrance │ │
│  │ ● Running — 42 faces   │  │ Stream: rtsp://...  │ │
│  │   2h 15m active         │  │ Resolution: 1080p   │ │
│  └─────────────────────────┘  └─────────────────────┘ │
│                                                       │
│  ┌─── Live Detections ─────────────────────────────┐ │
│  │ [face] [face] [face] [face] [face]              │ │
│  │                                                   │ │
│  │ Time     Face  Identity    Conf  New             │ │
│  │ 14:32    [img] Person#1    98%   No              │ │
│  │ 14:31    [img] NEW         87%   Yes             │ │
│  └───────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─── Health Metrics ──────────────────────────────┐ │
│  │ (existing health metrics table)                  │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**Key changes to the Show page:**
- Move "Device Details" card to the right of a new "Face Recognition" card (two-column layout)
- Add "Live Detections" section below stream preview
- Add recognition status indicator to stream preview overlay

### 5. Socket.io Connection

Reuse the existing socket.io setup. The backend already exports `io` and the frontend already has socket.io client as a dependency.

Create a shared hook if helpful:
```typescript
// hooks/useDeviceSocket.ts
function useDeviceSocket(deviceId: string, enabled: boolean) {
  const [detections, setDetections] = useState<Detection[]>([]);
  const [status, setStatus] = useState<RecognitionStatus | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000');
    socket.emit('join-device', { deviceId });

    socket.on('detection', (data) => {
      setDetections(prev => [data, ...prev].slice(0, 50));
    });

    socket.on('recognition:status', (data) => {
      setStatus(data);
    });

    return () => {
      socket.emit('leave-device', { deviceId });
      socket.disconnect();
    };
  }, [deviceId, enabled]);

  return { detections, status };
}
```

### 6. shadcn/ui Components Used

- `Switch` — for recognition toggle
- `Badge` — for status indicators, "NEW" tags
- `Card` / `CardHeader` / `CardContent` — section containers
- `Table` / `TableRow` / `TableCell` — detection history
- `Button` — FPS selector buttons (variant="outline", active variant="default")
- `Tooltip` — for disabled states, confidence details
- `ScrollArea` — horizontal scroll for face thumbnails
- `Avatar` / `AvatarImage` — face thumbnail display (circular crop)

### 7. Face Thumbnail Display

Face thumbnails come as base64 strings from the WebSocket event and the database. Display them using:

```tsx
<Avatar className="h-16 w-16">
  <AvatarImage src={`data:image/jpeg;base64,${thumbnail}`} />
  <AvatarFallback>
    <User className="h-6 w-6" />
  </AvatarFallback>
</Avatar>
```

For the recent faces strip, use a slightly larger size (e.g., `h-20 w-20`).

## Acceptance Criteria

- [ ] Recognition toggle enables/disables processing for a device
- [ ] FPS selector updates capture rate (1-5)
- [ ] Toggle disabled when no stream URL configured
- [ ] Status indicator shows recognition active/inactive on stream preview
- [ ] Live detections panel shows face thumbnails in real-time via WebSocket
- [ ] Detection history table loads from database and updates live
- [ ] Face thumbnails are clickable and navigate to Identity show page
- [ ] "NEW" badge shown for newly created identities
- [ ] Panel shows helpful empty state when recognition is off
- [ ] Components follow shadcn/ui patterns and TailwindCSS styling
- [ ] No `any` types in TypeScript
- [ ] Files under ~300 lines (split components as needed)
- [ ] Quality gates pass (`pnpm lint`, `pnpm typecheck`, `pnpm build`)
