/**
 * Face Scanner Domain Types
 */

import type { FaceResult } from '@vladmandic/human';
import type { ScanningSession, ScanningConfig, CaptureResult } from './scanning';

/**
 * Head pose angles (normalized values from -1 to 1)
 * Values from @vladmandic/human library
 */
export interface HeadPose {
  yaw: number; // -1 to 1 (left/right rotation)
  pitch: number; // -1 to 1 (up/down tilt)
  roll: number; // -1 to 1 (clockwise/counter-clockwise tilt)
}

/**
 * Face bounding box calculated from mesh landmarks
 */
export interface FaceBounds {
  left: number; // Left edge X coordinate
  top: number; // Top edge Y coordinate
  right: number; // Right edge X coordinate
  bottom: number; // Bottom edge Y coordinate
  width: number; // Face width (with expansion)
  height: number; // Face height (with expansion)
  centerX: number; // Face center X coordinate
  centerY: number; // Face center Y coordinate
}

/**
 * Complete face detection result from a single frame
 * Uses @vladmandic/human library format
 */
export interface FaceDetectionResult {
  faces: FaceResult[]; // Array of detected faces from Human library
  headPose: HeadPose | null; // Head pose for the primary face (first detected)
  faceBounds: FaceBounds | null; // Face bounding box for the primary face
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
 * Face detection configuration for Human library
 */
export interface FaceScannerConfig {
  modelBasePath?: string; // Path to Human library models (default: '/models')
  minConfidence?: number; // Minimum confidence for detection (default: 0.5)
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
