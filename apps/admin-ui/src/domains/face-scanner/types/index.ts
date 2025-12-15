/**
 * Face Scanner Domain Types
 */

import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { ScanningSession, ScanningConfig, CaptureResult } from './scanning';

/**
 * Head pose angles in degrees
 */
export interface HeadPose {
  yaw: number; // -90 to 90 degrees (left/right rotation)
  pitch: number; // -90 to 90 degrees (up/down tilt)
  roll: number; // -90 to 90 degrees (clockwise/counter-clockwise tilt)
}

/**
 * Complete face detection result from a single frame
 */
export interface FaceDetectionResult {
  landmarks: NormalizedLandmark[][]; // Array of face landmarks for each detected face
  headPose: HeadPose | null; // Head pose for the primary face (first detected)
  faceCount: number; // Number of faces detected in the frame
  timestamp: number; // Timestamp of detection
}

/**
 * Camera configuration
 */
export interface CameraConfig {
  width?: number; // Desired video width (default: use camera default)
  height?: number; // Desired video height (default: use camera default)
  facingMode?: 'user' | 'environment'; // Which camera to use (default: 'user')
  frameRate?: number; // Desired frame rate (default: use camera default)
}

/**
 * Face detection configuration for MediaPipe
 */
export interface FaceScannerConfig {
  numFaces?: number; // Maximum number of faces to detect (default: 1)
  minFaceDetectionConfidence?: number; // Minimum confidence for detection (default: 0.5)
  minFacePresenceConfidence?: number; // Minimum confidence for presence (default: 0.5)
  minTrackingConfidence?: number; // Minimum confidence for tracking (default: 0.5)
}

/**
 * Face scanner state
 */
export interface FaceScannerState {
  // Initialization status
  isInitialized: boolean;
  isInitializing: boolean;

  // Camera status
  isCameraActive: boolean;
  isStartingCamera: boolean;

  // Detection results
  lastDetectionResult: FaceDetectionResult | null;

  // Error state
  error: string | null;

  // Internal refs (stored in state for reactivity)
  videoElement: HTMLVideoElement | null;
  canvasElement: HTMLCanvasElement | null;
  stream: MediaStream | null;

  // Scanning session (optional, only present when scanning is active)
  scanningSession: ScanningSession | null;
}

/**
 * Face scanner actions
 */
export interface FaceScannerActions {
  // Initialization
  initialize: (config?: FaceScannerConfig) => Promise<void>;

  // Camera control
  startCamera: (videoElement: HTMLVideoElement, canvasElement: HTMLCanvasElement, config?: CameraConfig) => Promise<void>;
  stopCamera: () => void;

  // Error handling
  setError: (error: string | null) => void;
  clearError: () => void;

  // Scanning control
  startScanning: (config?: ScanningConfig) => void;
  stopScanning: () => void;
  resetScanning: () => void;

  // Cleanup
  cleanup: () => void;
}

/**
 * Complete face scanner model (state + actions)
 */
export type FaceScannerModel = FaceScannerState & FaceScannerActions;
