/**
 * Head Pose Calculation with @vladmandic/human Library
 *
 * Calculates head pose angles (yaw, pitch, roll) from Human library face detection results.
 * Uses normalized -1 to 1 range (not degrees).
 */

import type { FaceResult } from '@vladmandic/human';
import type { HeadPose, FaceBounds } from '../types';

/**
 * Calculate head pose from Human library face result
 * Returns normalized values from -1 to 1
 */
export function calculateHeadPoseFromHuman(face: FaceResult): HeadPose {
  return {
    yaw: face.rotation?.angle?.yaw || 0, // -1 to 1 (left/right)
    pitch: face.rotation?.angle?.pitch || 0, // -1 to 1 (up/down)
    roll: face.rotation?.angle?.roll || 0, // -1 to 1 (tilt)
  };
}

/**
 * Calculate face bounding box from mesh landmarks
 * Uses specific landmark indices for accurate bounds calculation
 *
 * Landmark indices from Human library:
 * - 247: Left corner of face
 * - 359: Right corner of face
 * - 168: Top of face (forehead)
 * - 0: Bottom of face (chin)
 *
 * Note: meshRaw from Human library is number[][] where each point is [x, y, z?]
 */
export function calculateFaceBounds(meshRaw: number[][]): FaceBounds {
  if (!meshRaw || meshRaw.length < 360) {
    throw new Error('Invalid mesh data: insufficient landmarks');
  }

  // Get key landmark positions (meshRaw format: [[x, y, z], ...])
  const left = meshRaw[247][0]; // Left corner X
  const top = meshRaw[168][1]; // Top Y
  const right = meshRaw[359][0]; // Right corner X
  const bottom = meshRaw[0][1]; // Bottom Y

  // Calculate base dimensions
  const baseWidth = right - left;
  const baseHeight = bottom - top;

  // Apply expansion (1.3x width, 2x height as per working implementation)
  const width = baseWidth * 1.3;
  const height = baseHeight * 2;

  // Calculate center
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;

  return {
    left,
    top,
    right,
    bottom,
    width,
    height,
    centerX,
    centerY,
  };
}

/**
 * Check if face bounds are within specified canvas insets
 *
 * @param faceBounds - Face bounding box
 * @param canvasWidth - Canvas width in pixels
 * @param canvasHeight - Canvas height in pixels
 * @param insets - [top, right, bottom, left] insets as fractions (0-1)
 * @returns true if face is within bounds
 */
export function isFaceInBounds(
  faceBounds: FaceBounds,
  canvasWidth: number,
  canvasHeight: number,
  insets: [number, number, number, number]
): boolean {
  const [topInset, rightInset, bottomInset, leftInset] = insets;

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
