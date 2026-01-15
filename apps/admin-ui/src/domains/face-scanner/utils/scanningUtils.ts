/**
 * Scanning Utilities
 *
 * Helper functions for face enrollment scanning
 * Based on proven implementation with 5 positions and ±0.3 tolerance
 */

import type { FaceResult } from '@vladmandic/human';
import type { HeadPose, FaceBounds } from '../types';
import type {
  HeadPosePosition,
  PositionTarget,
  CaptureResult,
  ScanningError,
  FaceBoxConfig,
} from '../types/scanning';

/**
 * Default 5-position targets for face enrollment
 * Uses normalized -1 to 1 range (not degrees)
 * Tolerance: ±0.3 for constrained axes, unlimited for primary axis
 */
export const DEFAULT_SCAN_POSITIONS: PositionTarget[] = [
  // Center position - must be first
  {
    position: 'center',
    yawMin: -0.3,
    yawMax: 0.3,
    pitchMin: -0.3,
    pitchMax: 0.3,
    angle: 0, // Center has no specific visual angle
  },

  // Top - pitch unlimited upward, yaw constrained
  {
    position: 'top',
    yawMin: -0.3,
    yawMax: 0.3,
    pitchMax: -0.3, // No pitchMin = unlimited upward
    angle: 0,
  },

  // Right - yaw unlimited rightward, pitch constrained
  {
    position: 'right',
    yawMin: 0.3, // No yawMax = unlimited rightward
    pitchMin: -0.3,
    pitchMax: 0.3,
    angle: 90,
  },

  // Bottom - pitch unlimited downward, yaw constrained
  {
    position: 'bottom',
    yawMin: -0.3,
    yawMax: 0.3,
    pitchMin: 0.3, // No pitchMax = unlimited downward
    angle: 180,
  },

  // Left - yaw unlimited leftward, pitch constrained
  {
    position: 'left',
    yawMax: -0.3, // No yawMin = unlimited leftward
    pitchMin: -0.3,
    pitchMax: 0.3,
    angle: 270,
  },
];

/**
 * Default face box configuration (dual-boundary system)
 * startFaceBox: Tight constraint for initial positioning (10% insets)
 * exitFaceBox: Looser boundary for reset trigger (5% insets)
 */
export const DEFAULT_FACE_BOX_CONFIG: FaceBoxConfig = {
  startFaceBox: [0.1, 0.1, 0.1, 0.1], // [top, right, bottom, left]
  exitFaceBox: [0.05, 0.05, 0.05, 0.05],
};

/**
 * Check if current head pose matches a target position
 * Uses optional min/max bounds (undefined = unlimited)
 */
export function matchesPosition(
  currentPose: HeadPose,
  target: PositionTarget
): boolean {
  const yawMatch =
    (target.yawMin === undefined || currentPose.yaw >= target.yawMin) &&
    (target.yawMax === undefined || currentPose.yaw <= target.yawMax);

  const pitchMatch =
    (target.pitchMin === undefined || currentPose.pitch >= target.pitchMin) &&
    (target.pitchMax === undefined || currentPose.pitch <= target.pitchMax);

  return yawMatch && pitchMatch;
}

/**
 * Find next uncaptured position from available positions
 * Returns null if all positions are captured
 * Center position MUST be captured first
 */
export function getNextUncapturedPosition(
  allPositions: PositionTarget[],
  capturedPositions: Set<HeadPosePosition>
): PositionTarget | null {
  // First, check if center is captured (must be first)
  const centerCaptured = capturedPositions.has('center');
  if (!centerCaptured) {
    return allPositions.find((p) => p.position === 'center') || null;
  }

  // Find any uncaptured position (order doesn't matter after center)
  return allPositions.find((p) => !capturedPositions.has(p.position)) || null;
}

/**
 * Get current target position based on current head pose
 * Used to highlight which position user should move to next
 */
export function getCurrentTargetFromPose(
  currentPose: HeadPose,
  allPositions: PositionTarget[],
  capturedPositions: Set<HeadPosePosition>
): PositionTarget | null {
  // Get uncaptured positions
  const uncapturedPositions = allPositions.filter(
    (p) => !capturedPositions.has(p.position)
  );

  if (uncapturedPositions.length === 0) {
    return null;
  }

  // Find position that matches current pose
  const matchingPosition = uncapturedPositions.find((p) =>
    matchesPosition(currentPose, p)
  );

  return matchingPosition || uncapturedPositions[0];
}

/**
 * Check if face bounds are within specified insets
 */
export function isFaceInBox(
  faceBounds: FaceBounds,
  canvasWidth: number,
  canvasHeight: number,
  boxInsets: [number, number, number, number]
): boolean {
  const [topInset, rightInset, bottomInset, leftInset] = boxInsets;

  const minX = canvasWidth * leftInset;
  const maxX = canvasWidth * (1 - rightInset);
  const minY = canvasHeight * topInset;
  const maxY = canvasHeight * (1 - bottomInset);

  return (
    faceBounds.left >= minX &&
    faceBounds.right <= maxX &&
    faceBounds.top >= minY &&
    faceBounds.bottom <= maxY
  );
}

/**
 * Capture image from canvas as base64 JPEG
 */
export function captureCanvasImage(
  canvas: HTMLCanvasElement,
  quality: number = 0.92
): string {
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Crop head region from canvas based on face bounds
 * Returns base64 JPEG of cropped head (square, centered on face)
 */
export function cropHeadImage(
  canvas: HTMLCanvasElement,
  faceBounds: FaceBounds,
  cropMultiplier: number = 1.5,
  quality: number = 0.92
): string {
  // Calculate crop size (square, based on face dimensions)
  const cropSize =
    Math.max(faceBounds.width, faceBounds.height) * cropMultiplier;

  // Calculate crop position (centered on face)
  // Note: Canvas is mirrored horizontally for selfie view
  const cropX = canvas.width - faceBounds.centerX - cropSize / 2;
  const cropY = faceBounds.centerY - cropSize / 2;

  // Ensure crop stays within canvas bounds
  const clampedX = Math.max(0, Math.min(canvas.width - cropSize, cropX));
  const clampedY = Math.max(0, Math.min(canvas.height - cropSize, cropY));
  const clampedSize = Math.min(cropSize, canvas.width, canvas.height);

  // Create temporary canvas for cropping
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = clampedSize;
  tempCanvas.height = clampedSize;
  const ctx = tempCanvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get 2D context for cropping');
  }

  // Draw cropped region
  ctx.drawImage(
    canvas,
    clampedX,
    clampedY,
    clampedSize,
    clampedSize,
    0,
    0,
    clampedSize,
    clampedSize
  );

  return tempCanvas.toDataURL('image/jpeg', quality);
}

/**
 * Validate scanning conditions using Human library results
 * Returns error type if conditions are invalid, null if valid
 */
export function validateScanningConditions(
  faceCount: number,
  faceBounds: FaceBounds | null,
  canvasWidth: number,
  canvasHeight: number,
  faceBoxConfig: FaceBoxConfig
): ScanningError | null {
  // Check if no face detected
  if (faceCount === 0 || !faceBounds) {
    return 'face_lost' as ScanningError;
  }

  // Check if multiple faces detected
  if (faceCount > 1) {
    return 'multiple_faces' as ScanningError;
  }

  // Check if face is out of exit box (reset boundary)
  if (
    !isFaceInBox(
      faceBounds,
      canvasWidth,
      canvasHeight,
      faceBoxConfig.exitFaceBox
    )
  ) {
    return 'out_of_bounds' as ScanningError;
  }

  return null;
}

/**
 * Calculate distance between face center and canvas center
 * Returns value from 0 (perfect center) to 1 (edge of frame)
 * Can be used to give "move closer/further" feedback
 */
export function calculateFaceCenterDistance(
  faceBounds: FaceBounds,
  canvasWidth: number,
  canvasHeight: number
): number {
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;

  const dx = (faceBounds.centerX - centerX) / centerX;
  const dy = (faceBounds.centerY - centerY) / centerY;

  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate face size relative to canvas
 * Returns value from 0 (tiny) to 1 (fills entire canvas)
 * Can be used to give "move closer/further" feedback
 */
export function calculateFaceSizeRatio(
  faceBounds: FaceBounds,
  canvasWidth: number,
  canvasHeight: number
): number {
  const faceArea = faceBounds.width * faceBounds.height;
  const canvasArea = canvasWidth * canvasHeight;
  return faceArea / canvasArea;
}

/**
 * Generate unique session ID
 */
export function generateSessionId(): string {
  return `scan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
