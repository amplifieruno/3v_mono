/**
 * Scanning Utilities
 *
 * Helper functions for face enrollment scanning
 */

import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { HeadPose } from '../types';
import type {
  HeadPosePosition,
  PositionTarget,
  CaptureResult,
  ScanningError
} from '../types/scanning';

/**
 * Default 9-position targets for face enrollment
 * Angles are in degrees relative to neutral position
 * NOTE: Angles are reduced for easier achievement, tolerance is increased
 */
export const DEFAULT_SCAN_POSITIONS: PositionTarget[] = [
  // Center position (straight ahead)
  { position: 'center', yaw: 0, pitch: 0, tolerance: 15, angle: 0 },

  // Cardinal directions - reduced angles for easier achievement
  { position: 'up', yaw: 0, pitch: 15, tolerance: 15, angle: 0 },
  { position: 'right', yaw: 20, pitch: 0, tolerance: 15, angle: 90 },
  { position: 'down', yaw: 0, pitch: -15, tolerance: 15, angle: 180 },
  { position: 'left', yaw: -20, pitch: 0, tolerance: 15, angle: 270 },

  // Diagonal directions - reduced angles and increased tolerance
  { position: 'up-right', yaw: 15, pitch: 12, tolerance: 18, angle: 45 },
  { position: 'down-right', yaw: 15, pitch: -12, tolerance: 18, angle: 135 },
  { position: 'down-left', yaw: -15, pitch: -12, tolerance: 18, angle: 225 },
  { position: 'up-left', yaw: -15, pitch: 12, tolerance: 18, angle: 315 }
];

/**
 * Check if current head pose matches a target position
 */
export function matchesPosition(
  currentPose: HeadPose,
  target: PositionTarget
): boolean {
  const yawDiff = Math.abs(currentPose.yaw - target.yaw);
  const pitchDiff = Math.abs(currentPose.pitch - target.pitch);

  return yawDiff <= target.tolerance && pitchDiff <= target.tolerance;
}

/**
 * Find next uncaptured position from available positions
 * Returns null if all positions are captured
 */
export function getNextUncapturedPosition(
  allPositions: PositionTarget[],
  capturedPositions: Set<HeadPosePosition>
): PositionTarget | null {
  // First, check if center is captured (must be first)
  const centerCaptured = capturedPositions.has('center');
  if (!centerCaptured) {
    return allPositions.find(p => p.position === 'center') || null;
  }

  // Find any uncaptured position (order doesn't matter after center)
  return allPositions.find(p => !capturedPositions.has(p.position)) || null;
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
    p => !capturedPositions.has(p.position)
  );

  if (uncapturedPositions.length === 0) {
    return null;
  }

  // Find closest uncaptured position to current pose
  let closestPosition: PositionTarget | null = null;
  let minDistance = Infinity;

  for (const position of uncapturedPositions) {
    const yawDiff = Math.abs(currentPose.yaw - position.yaw);
    const pitchDiff = Math.abs(currentPose.pitch - position.pitch);
    const distance = Math.sqrt(yawDiff * yawDiff + pitchDiff * pitchDiff);

    if (distance < minDistance) {
      minDistance = distance;
      closestPosition = position;
    }
  }

  return closestPosition;
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
 * Crop head region from canvas
 * Returns base64 JPEG of cropped head (square, centered on face)
 */
export function cropHeadImage(
  canvas: HTMLCanvasElement,
  landmarks: NormalizedLandmark[],
  cropMultiplier: number = 1.5,
  quality: number = 0.92
): string {
  // Calculate bounding box from landmarks
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  landmarks.forEach(landmark => {
    minX = Math.min(minX, landmark.x);
    maxX = Math.max(maxX, landmark.x);
    minY = Math.min(minY, landmark.y);
    maxY = Math.max(maxY, landmark.y);
  });

  // Convert to pixel coordinates
  const width = canvas.width;
  const height = canvas.height;

  const faceWidth = (maxX - minX) * width;
  const faceHeight = (maxY - minY) * height;
  const faceCenterX = ((minX + maxX) / 2) * width;
  const faceCenterY = ((minY + maxY) / 2) * height;

  // Calculate crop size (square, 150% of face size)
  const cropSize = Math.max(faceWidth, faceHeight) * cropMultiplier;

  // Calculate crop position (centered on face)
  // Note: X is mirrored, so we need to flip it
  const cropX = width - faceCenterX - cropSize / 2;
  const cropY = faceCenterY - cropSize / 2;

  // Ensure crop stays within canvas bounds
  const clampedX = Math.max(0, Math.min(width - cropSize, cropX));
  const clampedY = Math.max(0, Math.min(height - cropSize, cropY));
  const clampedSize = Math.min(cropSize, width, height);

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
 * Check if face is within bounds (with margin)
 * Returns true if face is within the specified margin of canvas
 */
export function isWithinBounds(
  landmarks: NormalizedLandmark[],
  boundsMargin: number = 0.9
): boolean {
  if (!landmarks || landmarks.length === 0) {
    return false;
  }

  // Calculate bounding box
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  landmarks.forEach(landmark => {
    minX = Math.min(minX, landmark.x);
    maxX = Math.max(maxX, landmark.x);
    minY = Math.min(minY, landmark.y);
    maxY = Math.max(maxY, landmark.y);
  });

  // Calculate margins
  const marginX = (1 - boundsMargin) / 2;
  const marginY = (1 - boundsMargin) / 2;

  // Check if face is within bounds
  return (
    minX >= marginX &&
    maxX <= (1 - marginX) &&
    minY >= marginY &&
    maxY <= (1 - marginY)
  );
}

/**
 * Validate scanning conditions
 * Returns error type if conditions are invalid, null if valid
 */
export function validateScanningConditions(
  faceCount: number,
  landmarks: NormalizedLandmark[][] | null,
  boundsMargin: number = 0.9
): ScanningError | null {
  // Check if no face detected
  if (faceCount === 0 || !landmarks || landmarks.length === 0) {
    return 'face_lost' as ScanningError;
  }

  // Check if multiple faces detected
  if (faceCount > 1) {
    return 'multiple_faces' as ScanningError;
  }

  // Check if face is out of bounds
  const firstFaceLandmarks = landmarks[0];
  if (!isWithinBounds(firstFaceLandmarks, boundsMargin)) {
    return 'out_of_bounds' as ScanningError;
  }

  return null;
}

/**
 * Calculate distance between face and ideal center position
 * Returns value from 0 (perfect center) to 1 (edge of frame)
 * Can be used to give "move closer/further" feedback
 */
export function calculateFaceCenterDistance(
  landmarks: NormalizedLandmark[]
): number {
  if (!landmarks || landmarks.length === 0) {
    return 1; // Maximum distance if no landmarks
  }

  // Calculate face center
  let sumX = 0, sumY = 0;
  landmarks.forEach(landmark => {
    sumX += landmark.x;
    sumY += landmark.y;
  });
  const centerX = sumX / landmarks.length;
  const centerY = sumY / landmarks.length;

  // Calculate distance from ideal center (0.5, 0.5)
  const dx = centerX - 0.5;
  const dy = centerY - 0.5;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Normalize to 0-1 range (diagonal distance is ~0.707)
  return Math.min(1, distance / 0.707);
}

/**
 * Calculate face size relative to frame
 * Returns value from 0 (tiny face) to 1 (face fills frame)
 * Can be used to give "move closer/further" feedback
 */
export function calculateFaceSize(
  landmarks: NormalizedLandmark[]
): number {
  if (!landmarks || landmarks.length === 0) {
    return 0;
  }

  // Calculate bounding box
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  landmarks.forEach(landmark => {
    minX = Math.min(minX, landmark.x);
    maxX = Math.max(maxX, landmark.x);
    minY = Math.min(minY, landmark.y);
    maxY = Math.max(maxY, landmark.y);
  });

  const width = maxX - minX;
  const height = maxY - minY;

  // Face size as percentage of frame (average of width and height)
  return (width + height) / 2;
}

/**
 * Generate unique session ID
 */
export function generateSessionId(): string {
  return `scan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
