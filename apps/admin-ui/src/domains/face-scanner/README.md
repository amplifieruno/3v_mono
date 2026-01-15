# Face Scanner Domain

Multi-angle face scanning for profile enrollment using @vladmandic/human library.

## Overview

This domain provides face scanning functionality to capture 5 different face angles (center, top, right, bottom, left) for improved facial recognition accuracy. The scanner uses head rotation tracking to automatically detect when the user has positioned their face correctly for each angle.

## Architecture

```
FaceScannerModal
  └─> FaceScanner
      └─> useFaceScanning hook
          └─> FaceRecognitionService
              ├─> @vladmandic/human (face detection)
              ├─> Camera stream management
              ├─> Head rotation tracking
              └─> Screenshot capture
```

## Key Components

### `FaceScannerModal`
Modal wrapper with two-step flow:
1. **Instructions step**: Shows user how to perform the scan
2. **Scanning step**: Runs the actual face scanning

### `FaceScanner`
Main scanning component that:
- Displays camera feed
- Shows position indicators
- Tracks captured positions
- Converts screenshots to File objects

### `PositionIndicator`
Visual feedback showing which positions have been captured.

## Hooks

### `useFaceScanning`
Main orchestration hook that manages:
- FaceRecognitionService lifecycle
- Status updates
- Position tracking
- Screenshot collection

### `useCameraStream`
Manages webcam stream:
- Permission handling
- Stream initialization
- Error handling
- Cleanup

## Services

### `FaceRecognitionService`
Core face scanning logic:
- Uses @vladmandic/human for face detection
- Tracks head rotation (yaw/pitch)
- Validates face position within bounds
- Captures screenshots at each angle
- Event-driven architecture (Listener pattern)

## Usage

```tsx
import { FaceScannerModal } from '@/domains/face-scanner'

function ProfileEdit() {
  const [scannerOpen, setScannerOpen] = useState(false)

  const handleComplete = async (files: File[]) => {
    // Upload files to backend
    for (const file of files) {
      const formData = new FormData()
      formData.append('image', file)

      await fetch(`/api/face/detect?profileId=${profileId}&skipSimilarityCheck=true`, {
        method: 'POST',
        body: formData,
      })
    }

    setScannerOpen(false)
  }

  return (
    <>
      <Button onClick={() => setScannerOpen(true)}>
        Create Face ID
      </Button>

      <FaceScannerModal
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onComplete={handleComplete}
        profileId={profileId}
      />
    </>
  )
}
```

## Backend Integration

The scanner uploads captured images to `/api/face/detect` with query parameters:

- `profileId`: UUID of profile to link identities to
- `skipSimilarityCheck=true`: Creates separate identity for each angle (no merging)

Each of the 5 angles creates a separate Identity record in the database, all linked to the same Profile.

## Models

The Human library requires models to be in `public/models/` directory:
- `blazeface.json` & `blazeface.bin` - Face detection
- `facemesh.json` & `facemesh.bin` - Face mesh/landmarks

These models will be downloaded automatically by the library on first use.

## Position Tracking

The scanner tracks 5 head positions based on yaw (left/right) and pitch (up/down) angles:

- **center**: Face forward (yaw: -0.3 to 0.3, pitch: -0.3 to 0.3)
- **top**: Look up (yaw: -0.3 to 0.3, pitch < -0.3)
- **right**: Turn right (yaw > 0.3, pitch: -0.3 to 0.3)
- **bottom**: Look down (yaw: -0.3 to 0.3, pitch > 0.3)
- **left**: Turn left (yaw < -0.3, pitch: -0.3 to 0.3)

## Workflow

1. User clicks "Create Face ID" button
2. Modal opens with instructions
3. User starts scanning
4. Camera activates
5. User positions face in center → captured
6. User rotates head through 4 additional positions → captured
7. 5 JPEG files generated (one per position)
8. Files uploaded to backend
9. Backend creates 5 Identity records with embeddings
10. Identities linked to Profile

## Error Handling

The scanner handles:
- Camera permission denied
- No camera available
- Face detection model loading failure
- Network errors during upload
- InsightFace service unavailable

## Debug Mode

Enable debug mode to see:
- Face bounding box overlay
- Position boundary indicators
- Status and position tracking info

```tsx
<FaceScannerModal debug={true} />
```

## Future Enhancements

- Face quality validation (blur detection)
- Lighting quality check
- Face alignment guidance
- Progress indicator during upload
- Identity verification status toggle
- Bulk identity management
- Unit and E2E tests
