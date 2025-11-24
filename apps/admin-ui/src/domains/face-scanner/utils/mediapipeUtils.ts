/**
 * MediaPipe Utilities
 *
 * Helper functions for initializing and configuring MediaPipe Face Landmarker
 */

import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { FaceScannerConfig } from '../types';

/**
 * Initialize MediaPipe Face Landmarker with configuration
 */
export async function initializeFaceLandmarker(
  config?: FaceScannerConfig
): Promise<FaceLandmarker> {
  try {
    // Load MediaPipe Vision task files
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    // Create FaceLandmarker instance
    const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numFaces: config?.numFaces ?? 1,
      minFaceDetectionConfidence: config?.minFaceDetectionConfidence ?? 0.5,
      minFacePresenceConfidence: config?.minFacePresenceConfidence ?? 0.5,
      minTrackingConfidence: config?.minTrackingConfidence ?? 0.5,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false
    });

    return faceLandmarker;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to initialize MediaPipe: ${error.message}`);
    }
    throw new Error('Failed to initialize MediaPipe: Unknown error');
  }
}

/**
 * Check if MediaPipe is supported in the current browser
 */
export function isMediaPipeSupported(): boolean {
  // Check for required browser features
  return (
    typeof WebAssembly !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    'GPU' in navigator
  );
}
