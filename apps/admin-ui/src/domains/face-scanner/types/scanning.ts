/**
 * Face Scanning / Enrollment Types
 *
 * Types for guided face enrollment with 5-position capture
 * Based on proven implementation from @vladmandic/human
 */

import type { FaceResult } from '@vladmandic/human';
import type { HeadPose, FaceBounds } from './index';

/**
 * Head pose positions for enrollment (5 positions total)
 * Simplified from 9 to 5 for better UX
 */
export type HeadPosePosition = 'center' | 'top' | 'right' | 'bottom' | 'left';

/**
 * Target position with expected head pose angles
 * Uses normalized -1 to 1 range (not degrees)
 */
export interface PositionTarget {
  position: HeadPosePosition;
  yawMin?: number; // Minimum yaw value (optional = unlimited)
  yawMax?: number; // Maximum yaw value (optional = unlimited)
  pitchMin?: number; // Minimum pitch value (optional = unlimited)
  pitchMax?: number; // Maximum pitch value (optional = unlimited)
  angle: number; // Visual angle on circular guide (0° = top, clockwise)
}

/**
 * Face box configuration for dual-boundary system
 */
export interface FaceBoxConfig {
  startFaceBox: [number, number, number, number]; // [top, right, bottom, left] insets
  exitFaceBox: [number, number, number, number]; // Reset boundary (looser)
}

/**
 * Result of a single position capture
 */
export interface CaptureResult {
  id: HeadPosePosition; // Human-readable position ID
  fullImage: string; // Base64 JPEG of full frame
  headImage: string; // Base64 JPEG of cropped head (150% of face bbox)
  headPose: HeadPose; // Head pose at capture time
  face: FaceResult; // Complete face data from Human library
  timestamp: number; // Capture timestamp
}

/**
 * Scanning session state
 */
export interface ScanningSession {
  isScanning: boolean; // Whether scanning is active
  currentTargetPosition: PositionTarget | null; // Current position being captured
  capturedPositions: Set<HeadPosePosition>; // Set of captured positions
  captures: CaptureResult[]; // Array of all captures
  holdStartTime: number | null; // Timestamp when started holding position (for center)
  sessionStartTime: number; // Timestamp when session started
  sessionId: string; // Unique session ID
  lastError: string | null; // Last error message
}

/**
 * Configuration for scanning session
 */
export interface ScanningConfig {
  /**
   * How long to hold center position before capture (ms)
   * @default 1000
   */
  holdDuration?: number;

  /**
   * Maximum session duration before timeout (ms)
   * @default 120000 (2 minutes)
   */
  sessionTimeout?: number;

  /**
   * Size of guide circle relative to container height
   * @default 0.6 (60%)
   */
  guideSize?: number;

  /**
   * JPEG quality for captured images
   * @default 0.92
   */
  captureQuality?: number;

  /**
   * Crop multiplier for head image (relative to face bbox)
   * @default 1.5 (150%)
   */
  cropMultiplier?: number;

  /**
   * Custom position targets (overrides default 5 positions)
   */
  positions?: PositionTarget[];

  /**
   * Face box configuration (dual-boundary system)
   */
  faceBoxConfig?: FaceBoxConfig;

  /**
   * Auto-start scanning on mount
   * @default false
   */
  autoStart?: boolean;
}

/**
 * Instructions for user during scanning
 */
export enum ScanningInstruction {
  POSITION_FACE = 'Position your face in the center',
  MOVE_CLOSER = 'Move closer to the camera',
  MOVE_BACK = 'Move back from the camera',
  HOLD_STILL = 'Look at the camera and hold still',
  ROTATE_HEAD = 'Rotate your head in a circle',
  KEEP_ROTATING = 'Keep rotating your head',
  FACE_LOST = 'Face lost - please stay in view',
  MULTIPLE_FACES = 'Multiple faces detected - only one person',
  OUT_OF_BOUNDS = 'Please center your face in the frame',
  COMPLETE = 'Scan complete!',
  ERROR = 'Error occurred - restarting'
}

/**
 * Scanning session error types
 */
export enum ScanningError {
  FACE_LOST = 'face_lost',
  MULTIPLE_FACES = 'multiple_faces',
  OUT_OF_BOUNDS = 'out_of_bounds',
  TIMEOUT = 'session_timeout',
  CAMERA_ERROR = 'camera_error',
  UNKNOWN = 'unknown_error'
}
