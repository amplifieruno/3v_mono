/**
 * Face Scanner Domain
 *
 * Multi-angle face scanning for profile enrollment using @vladmandic/human library.
 * Captures 5 face angles (center, top, right, bottom, left) for improved recognition accuracy.
 */

// Types
export type {
  FaceBox,
  BoxInset,
  Position,
  ScanStatus,
  ScanPosition,
  ScanResult,
  FaceScannerConfig,
  PositionIndicatorState,
  FaceDetectionResult,
  Screenshot,
} from './types'

export { StatusMessages } from './types'

// Components
export { FaceScanner } from './components/FaceScanner'
export type { FaceScannerProps } from './components/FaceScanner'
export { FaceScannerModal } from './components/FaceScannerModal'
export type { FaceScannerModalProps } from './components/FaceScannerModal'
export { PositionIndicator } from './components/PositionIndicator'
export { ScanningInstructions } from './components/ScanningInstructions'

// Hooks
export { useCameraStream } from './hooks/useCameraStream'
export type { UseCameraStreamOptions, UseCameraStreamReturn } from './hooks/useCameraStream'
export { useFaceScanning } from './hooks/useFaceScanning'
export type {
  UseFaceScanningOptions,
  UseFaceScanningReturn,
} from './hooks/useFaceScanning'
// export { useFaceDetection } from './hooks/useFaceDetection'
// export { useFacePositioning } from './hooks/useFacePositioning'

// Services
export { FaceRecognitionService } from './services/FaceRecognitionService'
export { default as Listener } from './services/Listener'

// Utils
export * from './utils/faceBoxHelpers'
export * from './utils/screenshotHelpers'
