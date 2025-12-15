/**
 * Head Pose Calculation with OpenCV solvePnP
 *
 * Calculates head pose angles (yaw, pitch, roll) from MediaPipe face landmarks
 * using OpenCV's Perspective-n-Point (PnP) algorithm.
 */

import cv from '@tbmc/opencv-js';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { HeadPose } from '../types';

// 3D model points of key facial landmarks in a normalized face model
// Coordinates in millimeters from a standard 3D face model
const MODEL_POINTS_3D = [
  [0.0, 0.0, 0.0], // Nose tip (origin)
  [0.0, -330.0, -65.0], // Chin
  [-225.0, 170.0, -135.0], // Left eye outer corner
  [225.0, 170.0, -135.0], // Right eye outer corner
  [-150.0, -150.0, -125.0], // Left mouth corner
  [150.0, -150.0, -125.0], // Right mouth corner
];

// MediaPipe Face Landmarker indices for key facial points
const LANDMARK_INDICES = [
  1, // Nose tip
  152, // Chin
  33, // Left eye outer corner
  263, // Right eye outer corner
  61, // Left mouth corner
  291, // Right mouth corner
];

/**
 * Calculate head pose from MediaPipe face landmarks using OpenCV solvePnP
 */
export function calculateHeadPose(
  landmarks: NormalizedLandmark[],
  imageWidth: number,
  imageHeight: number
): HeadPose {
  try {
    // Extract 2D image points from landmarks (convert normalized to pixel coordinates)
    const imagePoints2D: number[][] = [];
    for (const idx of LANDMARK_INDICES) {
      const landmark = landmarks[idx];
      if (!landmark) {
        console.warn(`Landmark at index ${idx} is missing`);
        return { yaw: 0, pitch: 0, roll: 0 };
      }
      imagePoints2D.push([landmark.x * imageWidth, landmark.y * imageHeight]);
    }

    // Convert to OpenCV Mat format
    const objectPoints = cv.matFromArray(
      6,
      3,
      cv.CV_32F,
      MODEL_POINTS_3D.flat()
    );
    const imagePoints = cv.matFromArray(6, 2, cv.CV_32F, imagePoints2D.flat());

    // Camera intrinsic matrix (simplified pinhole camera model)
    const focalLength = imageWidth;
    const centerX = imageWidth / 2;
    const centerY = imageHeight / 2;

    const cameraMatrix = cv.matFromArray(3, 3, cv.CV_32F, [
      focalLength,
      0,
      centerX,
      0,
      focalLength,
      centerY,
      0,
      0,
      1,
    ]);

    // Distortion coefficients (assume no distortion)
    const distCoeffs = cv.Mat.zeros(4, 1, cv.CV_32F);

    // Rotation and translation vectors (output)
    const rvec = new cv.Mat();
    const tvec = new cv.Mat();

    // Solve PnP
    cv.solvePnP(
      objectPoints,
      imagePoints,
      cameraMatrix,
      distCoeffs,
      rvec,
      tvec
    );

    // Convert rotation vector to rotation matrix
    const rotationMatrix = new cv.Mat();
    cv.Rodrigues(rvec, rotationMatrix);

    // Extract rotation matrix values
    const R = [];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        R.push(rotationMatrix.doubleAt(i, j));
      }
    }

    // Convert rotation matrix to Euler angles (yaw, pitch, roll)
    // Using the ZYX convention (common for head pose)
    const sy = Math.sqrt(R[0] * R[0] + R[3] * R[3]);
    const singular = sy < 1e-6;

    let yaw, pitch, roll;

    console.log('singular', singular);

    if (!singular) {
      yaw = Math.atan2(R[3], R[0]); // Rotation around Y-axis
      pitch = Math.atan2(-R[6], sy); // Rotation around X-axis
      roll = Math.atan2(R[7], R[8]); // Rotation around Z-axis
    } else {
      yaw = Math.atan2(-R[5], R[4]);
      pitch = Math.atan2(-R[6], sy);
      roll = 0;
    }

    // Convert radians to degrees
    const radToDeg = 180 / Math.PI;
    const result = {
      yaw: yaw * radToDeg,
      pitch: pitch * radToDeg,
      roll: roll * radToDeg,
    };

    // Cleanup OpenCV matrices
    objectPoints.delete();
    imagePoints.delete();
    cameraMatrix.delete();
    distCoeffs.delete();
    rvec.delete();
    tvec.delete();
    rotationMatrix.delete();

    return result;
  } catch (error) {
    console.error('Error calculating head pose with solvePnP:', error);
    return { yaw: 0, pitch: 0, roll: 0 };
  }
}

/**
 * Simplified head pose calculation (fallback, for backward compatibility)
 * Uses basic geometric approximations without OpenCV
 */
export function getSimplifiedHeadPose(
  landmarks: NormalizedLandmark[]
): HeadPose {
  if (!landmarks || landmarks.length < Math.max(...LANDMARK_INDICES)) {
    return { yaw: 0, pitch: 0, roll: 0 };
  }

  // Get key landmarks
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const nose = landmarks[1];
  const chin = landmarks[152];

  if (!leftEye || !rightEye || !nose || !chin) {
    return { yaw: 0, pitch: 0, roll: 0 };
  }

  // Eye center
  const eyeCenterX = (leftEye.x + rightEye.x) / 2;

  // Yaw: horizontal deviation of nose from eye center
  const yaw = (nose.x - eyeCenterX) * 90;

  // Pitch: nose-to-chin distance (relative to face geometry)
  const noseToChainDistance = chin.y - nose.y;
  const NEUTRAL_DISTANCE = 0.18;
  const SCALE_FACTOR = 200;
  const pitch = (NEUTRAL_DISTANCE - noseToChainDistance) * SCALE_FACTOR;

  // Roll: eye tilt angle
  const eyeAngle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
  const roll = eyeAngle * (180 / Math.PI);

  return {
    yaw: Math.max(-90, Math.min(90, yaw)),
    pitch: Math.max(-90, Math.min(90, pitch)),
    roll: Math.max(-90, Math.min(90, roll)),
  };
}
