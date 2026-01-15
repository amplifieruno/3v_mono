/**
 * Face Scanner Domain - Public API
 *
 * Usage pattern:
 * <FaceScannerProvider model={<optional>} onModelCreated={<if model is created internally>}>
 *   <FaceScannerMask>
 *     <FaceScannerCamera />
 *   </FaceScannerMask>
 * </FaceScannerProvider>
 */

// Components
export { FaceScannerCamera } from './components/face-scanner-camera';
export { FaceScannerMask } from './components/face-scanner-mask';
export { FaceScannerScanningMask } from './components/face-scanner-scanning-mask';

// Context and Provider
export {
  FaceScannerProvider,
  useFaceScannerModel,
  useFaceScannerState
} from './context/face-scanner-context';

// Model
export { createFaceScannerModel } from './model/face-scanner-model';
export type { FaceScannerStore } from './model/face-scanner-model';

// Types
export type {
  HeadPose,
  FaceBounds,
  FaceDetectionResult,
  CameraConfig,
  FaceScannerConfig,
  FaceScannerState,
  FaceScannerActions,
  FaceScannerModel
} from './types';

// Scanning Types
export type {
  HeadPosePosition,
  PositionTarget,
  CaptureResult,
  ScanningSession,
  ScanningConfig,
  FaceBoxConfig
} from './types/scanning';

export { ScanningInstruction, ScanningError } from './types/scanning';

// Utilities (if needed externally)
export {
  calculateHeadPoseFromHuman,
  calculateFaceBounds,
  isFaceInBounds
} from './utils/headPoseCalculation';

export {
  DEFAULT_SCAN_POSITIONS,
  DEFAULT_FACE_BOX_CONFIG,
  matchesPosition,
  getNextUncapturedPosition,
  isFaceInBox,
  captureCanvasImage,
  cropHeadImage,
  validateScanningConditions,
  calculateFaceCenterDistance,
  calculateFaceSizeRatio,
  generateSessionId
} from './utils/scanningUtils';

export { initializeHuman, createHumanConfig } from './utils/humanUtils';
