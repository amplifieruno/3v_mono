/**
 * Face Scanning / Enrollment Types
 *
 * Types for guided face enrollment with 9-position capture
 */

import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { HeadPose } from './index';

/**
 * Head pose positions for enrollment (9 positions total)
 */
export type HeadPosePosition =
  | 'center'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'up-left'
  | 'up-right'
  | 'down-left'
  | 'down-right';

/**
 * Target position with expected head pose angles
 */
export interface PositionTarget {
  position: HeadPosePosition;
  yaw: number; // Target yaw angle in degrees
  pitch: number; // Target pitch angle in degrees
  tolerance: number; // Tolerance in degrees for matching
  angle: number; // Visual angle on circular guide (0° = top, clockwise)
}

/**
 * Result of a single position capture
 */
export interface CaptureResult {
  id: HeadPosePosition; // Human-readable position ID
  fullImage: string; // Base64 JPEG of full frame
  headImage: string; // Base64 JPEG of cropped head (150% of face bbox)
  headPose: HeadPose; // Head pose at capture time
  landmarks: NormalizedLandmark[][]; // Face landmarks
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
   * Tolerance for position matching (degrees)
   * @default 10
   */
  positionTolerance?: number;

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
   * Bounds check margin (percentage of canvas)
   * Face must be within this margin
   * @default 0.9 (90% - 10% margin)
   */
  boundsMargin?: number;

  /**
   * Custom position targets (overrides default 9 positions)
   */
  positions?: PositionTarget[];

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
