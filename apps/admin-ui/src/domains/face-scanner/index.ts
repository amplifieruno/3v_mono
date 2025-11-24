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
  FaceDetectionResult,
  CameraConfig,
  FaceScannerConfig,
  FaceScannerState,
  FaceScannerActions,
  FaceScannerModel
} from './types';

// Utilities (if needed externally)
export {
  getSimplifiedHeadPose,
  calculateHeadPose
} from './utils/headPoseCalculation';
