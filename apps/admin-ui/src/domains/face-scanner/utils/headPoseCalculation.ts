/**
 * Head Pose Calculation Utilities
 *
 * Calculates head pose angles (yaw, pitch, roll) from MediaPipe face landmarks
 * using a simplified 6-point Perspective-n-Point (PnP) algorithm.
 */

import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { HeadPose } from '../types';

// 3D model points of key facial landmarks in a normalized face model
// These are approximate real-world coordinates in millimeters
const MODEL_POINTS_3D = {
  noseTip: [0.0, 0.0, 0.0],           // Nose tip (origin)
  chin: [0.0, -330.0, -65.0],         // Chin
  leftEyeLeft: [-225.0, 170.0, -135.0],  // Left eye outer corner
  rightEyeRight: [225.0, 170.0, -135.0], // Right eye outer corner
  leftMouthCorner: [-150.0, -150.0, -125.0], // Left mouth corner
  rightMouthCorner: [150.0, -150.0, -125.0]  // Right mouth corner
};

// MediaPipe Face Landmarker indices for key facial points
const LANDMARK_INDICES = {
  noseTip: 1,           // Nose tip
  chin: 152,            // Chin
  leftEyeLeft: 33,      // Left eye outer corner
  rightEyeRight: 263,   // Right eye outer corner
  leftMouthCorner: 61,  // Left mouth corner
  rightMouthCorner: 291 // Right mouth corner
};

/**
 * Calculate head pose from MediaPipe face landmarks
 */
export function calculateHeadPose(
  landmarks: NormalizedLandmark[],
  imageWidth: number,
  imageHeight: number
): HeadPose {
  // Extract 2D image points from landmarks (convert normalized to pixel coordinates)
  const imagePoints2D = [
    [landmarks[LANDMARK_INDICES.noseTip].x * imageWidth, landmarks[LANDMARK_INDICES.noseTip].y * imageHeight],
    [landmarks[LANDMARK_INDICES.chin].x * imageWidth, landmarks[LANDMARK_INDICES.chin].y * imageHeight],
    [landmarks[LANDMARK_INDICES.leftEyeLeft].x * imageWidth, landmarks[LANDMARK_INDICES.leftEyeLeft].y * imageHeight],
    [landmarks[LANDMARK_INDICES.rightEyeRight].x * imageWidth, landmarks[LANDMARK_INDICES.rightEyeRight].y * imageHeight],
    [landmarks[LANDMARK_INDICES.leftMouthCorner].x * imageWidth, landmarks[LANDMARK_INDICES.leftMouthCorner].y * imageHeight],
    [landmarks[LANDMARK_INDICES.rightMouthCorner].x * imageWidth, landmarks[LANDMARK_INDICES.rightMouthCorner].y * imageHeight]
  ];

  // 3D model points
  const modelPoints3D = [
    MODEL_POINTS_3D.noseTip,
    MODEL_POINTS_3D.chin,
    MODEL_POINTS_3D.leftEyeLeft,
    MODEL_POINTS_3D.rightEyeRight,
    MODEL_POINTS_3D.leftMouthCorner,
    MODEL_POINTS_3D.rightMouthCorner
  ];

  // Camera intrinsic matrix (simplified pinhole camera model)
  const focalLength = imageWidth;
  const center = [imageWidth / 2, imageHeight / 2];

  // Solve PnP to get rotation and translation vectors
  const { rotationVector } = solvePnP(modelPoints3D, imagePoints2D, focalLength, center);

  // Convert rotation vector to Euler angles
  const eulerAngles = rotationVectorToEulerAngles(rotationVector);

  return {
    yaw: eulerAngles.yaw,
    pitch: eulerAngles.pitch,
    roll: eulerAngles.roll
  };
}

/**
 * Simplified Perspective-n-Point solver
 * Returns rotation vector (Rodrigues notation)
 */
function solvePnP(
  modelPoints3D: number[][],
  imagePoints2D: number[][],
  focalLength: number,
  center: number[]
): { rotationVector: number[] } {
  // This is a simplified iterative solution
  // For production, consider using a proper PnP library or OpenCV.js

  // Initial guess for rotation (no rotation)
  let rotationVector = [0, 0, 0];

  // Iterative refinement (simplified Levenberg-Marquardt)
  for (let iter = 0; iter < 10; iter++) {
    const rotationMatrix = rodrigues(rotationVector);

    // Calculate reprojection error and Jacobian
    let totalError = 0;
    const gradient = [0, 0, 0];

    for (let i = 0; i < modelPoints3D.length; i++) {
      const point3D = modelPoints3D[i];
      const point2D = imagePoints2D[i];

      // Project 3D point to 2D
      const projected = project3DTo2D(point3D, rotationMatrix, focalLength, center);

      // Calculate error
      const errorX = projected[0] - point2D[0];
      const errorY = projected[1] - point2D[1];
      totalError += errorX * errorX + errorY * errorY;

      // Approximate gradient (numerical differentiation)
      const epsilon = 0.01;
      for (let j = 0; j < 3; j++) {
        const perturbedRot = [...rotationVector];
        perturbedRot[j] += epsilon;
        const perturbedMatrix = rodrigues(perturbedRot);
        const perturbedProjected = project3DTo2D(point3D, perturbedMatrix, focalLength, center);

        gradient[j] += (perturbedProjected[0] - projected[0]) * errorX / epsilon;
        gradient[j] += (perturbedProjected[1] - projected[1]) * errorY / epsilon;
      }
    }

    // Update rotation vector
    const learningRate = 0.0001;
    for (let j = 0; j < 3; j++) {
      rotationVector[j] -= learningRate * gradient[j];
    }

    // Break if converged
    if (totalError < 1.0) break;
  }

  return { rotationVector };
}

/**
 * Rodrigues formula: Convert rotation vector to rotation matrix
 */
function rodrigues(rotationVector: number[]): number[][] {
  const theta = Math.sqrt(
    rotationVector[0] * rotationVector[0] +
    rotationVector[1] * rotationVector[1] +
    rotationVector[2] * rotationVector[2]
  );

  if (theta < 1e-10) {
    // No rotation
    return [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ];
  }

  // Normalize rotation axis
  const r = rotationVector.map(v => v / theta);

  // Rodrigues' rotation formula
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  const oneMinusCos = 1 - cosTheta;

  const rotationMatrix = [
    [
      cosTheta + r[0] * r[0] * oneMinusCos,
      r[0] * r[1] * oneMinusCos - r[2] * sinTheta,
      r[0] * r[2] * oneMinusCos + r[1] * sinTheta
    ],
    [
      r[1] * r[0] * oneMinusCos + r[2] * sinTheta,
      cosTheta + r[1] * r[1] * oneMinusCos,
      r[1] * r[2] * oneMinusCos - r[0] * sinTheta
    ],
    [
      r[2] * r[0] * oneMinusCos - r[1] * sinTheta,
      r[2] * r[1] * oneMinusCos + r[0] * sinTheta,
      cosTheta + r[2] * r[2] * oneMinusCos
    ]
  ];

  return rotationMatrix;
}

/**
 * Project 3D point to 2D using rotation matrix and camera parameters
 */
function project3DTo2D(
  point3D: number[],
  rotationMatrix: number[][],
  focalLength: number,
  center: number[]
): number[] {
  // Apply rotation
  const rotated = [
    rotationMatrix[0][0] * point3D[0] + rotationMatrix[0][1] * point3D[1] + rotationMatrix[0][2] * point3D[2],
    rotationMatrix[1][0] * point3D[0] + rotationMatrix[1][1] * point3D[1] + rotationMatrix[1][2] * point3D[2],
    rotationMatrix[2][0] * point3D[0] + rotationMatrix[2][1] * point3D[1] + rotationMatrix[2][2] * point3D[2]
  ];

  // Assume translation is negligible for head pose (camera at origin)
  // In reality, you'd add translation vector here
  const z = rotated[2] + 1000; // Add constant depth to avoid division by zero

  // Perspective projection
  const x = (rotated[0] * focalLength / z) + center[0];
  const y = (rotated[1] * focalLength / z) + center[1];

  return [x, y];
}

/**
 * Convert rotation vector to Euler angles (yaw, pitch, roll)
 */
function rotationVectorToEulerAngles(rotationVector: number[]): HeadPose {
  const rotationMatrix = rodrigues(rotationVector);

  // Extract Euler angles from rotation matrix
  // Using ZYX convention (yaw-pitch-roll)

  const sy = Math.sqrt(
    rotationMatrix[0][0] * rotationMatrix[0][0] +
    rotationMatrix[1][0] * rotationMatrix[1][0]
  );

  const singular = sy < 1e-6;

  let pitch, yaw, roll;

  if (!singular) {
    pitch = Math.atan2(-rotationMatrix[2][0], sy);
    yaw = Math.atan2(rotationMatrix[1][0], rotationMatrix[0][0]);
    roll = Math.atan2(rotationMatrix[2][1], rotationMatrix[2][2]);
  } else {
    pitch = Math.atan2(-rotationMatrix[2][0], sy);
    yaw = Math.atan2(-rotationMatrix[0][1], rotationMatrix[1][1]);
    roll = 0;
  }

  // Convert radians to degrees
  return {
    yaw: yaw * (180 / Math.PI),
    pitch: pitch * (180 / Math.PI),
    roll: roll * (180 / Math.PI)
  };
}

/**
 * Get a simplified head pose estimation from face landmarks
 * This is a faster alternative that uses geometric relationships instead of PnP
 */
export function getSimplifiedHeadPose(
  landmarks: NormalizedLandmark[]
): HeadPose {
  // Validate landmarks exist
  if (!landmarks || landmarks.length < Math.max(...Object.values(LANDMARK_INDICES))) {
    console.error('Invalid landmarks array for head pose calculation', {
      hasLandmarks: !!landmarks,
      length: landmarks?.length || 0,
      requiredLength: Math.max(...Object.values(LANDMARK_INDICES))
    });
    return { yaw: 0, pitch: 0, roll: 0 };
  }

  // Calculate yaw (left/right) from eye and nose positions
  const leftEye = landmarks[LANDMARK_INDICES.leftEyeLeft];
  const rightEye = landmarks[LANDMARK_INDICES.rightEyeRight];
  const nose = landmarks[LANDMARK_INDICES.noseTip];

  // Validate required landmarks are defined
  if (!leftEye || !rightEye || !nose) {
    console.error('Required landmarks missing for head pose calculation', {
      hasLeftEye: !!leftEye,
      hasRightEye: !!rightEye,
      hasNose: !!nose
    });
    return { yaw: 0, pitch: 0, roll: 0 };
  }

  // Validate landmark coordinates are valid numbers
  if (isNaN(leftEye.x) || isNaN(leftEye.y) || isNaN(rightEye.x) || isNaN(rightEye.y) || isNaN(nose.x) || isNaN(nose.y)) {
    console.error('Landmark coordinates contain NaN values');
    return { yaw: 0, pitch: 0, roll: 0 };
  }

  // Eye center
  const eyeCenterX = (leftEye.x + rightEye.x) / 2;

  // Yaw: deviation of nose from eye center
  const yaw = (nose.x - eyeCenterX) * 90; // Approximate scaling

  // Calculate pitch (up/down) from nose and chin positions
  const chin = landmarks[LANDMARK_INDICES.chin];

  // Validate chin landmark
  if (!chin || isNaN(chin.y)) {
    console.error('Chin landmark missing or invalid');
    return { yaw: 0, pitch: 0, roll: 0 };
  }

  const noseToChainDistance = chin.y - nose.y;
  const pitch = (nose.y - 0.5) * -90; // Approximate scaling

  // Calculate roll (tilt) from eye positions
  const eyeAngle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
  const roll = eyeAngle * (180 / Math.PI);

  // Validate final angles
  const finalPose = {
    yaw: Math.max(-90, Math.min(90, yaw)),
    pitch: Math.max(-90, Math.min(90, pitch)),
    roll: Math.max(-90, Math.min(90, roll))
  };

  // Check for NaN in final results
  if (isNaN(finalPose.yaw) || isNaN(finalPose.pitch) || isNaN(finalPose.roll)) {
    console.error('Head pose calculation resulted in NaN', { leftEye, rightEye, nose, chin });
    return { yaw: 0, pitch: 0, roll: 0 };
  }

  return finalPose;
}
