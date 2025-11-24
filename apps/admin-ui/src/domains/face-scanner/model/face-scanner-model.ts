/**
 * Face Scanner Model (Zustand Store)
 *
 * Manages face detection state, MediaPipe processing, and camera stream.
 * All heavy calculations are extracted to utils.
 */

import { create } from 'zustand';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import type {
  FaceScannerModel,
  FaceScannerState,
  FaceScannerConfig,
  CameraConfig,
  FaceDetectionResult
} from '../types';
import { initializeFaceLandmarker } from '../utils/mediapipeUtils';
import {
  initializeCameraStream,
  stopMediaStream,
  attachStreamToVideo
} from '../utils/cameraUtils';
import { drawMirroredVideoFrame } from '../utils/canvasUtils';
import { getSimplifiedHeadPose } from '../utils/headPoseCalculation';

/**
 * Internal state that's not exposed via the model interface
 */
interface InternalState {
  faceLandmarker: FaceLandmarker | null;
  animationFrameId: number | null;
  lastVideoTime: number;
}

/**
 * Create a new Face Scanner Model (Zustand store factory)
 */
export function createFaceScannerModel() {
  // Internal state outside Zustand store (for non-reactive refs)
  let internal: InternalState = {
    faceLandmarker: null,
    animationFrameId: null,
    lastVideoTime: -1
  };

  const store = create<FaceScannerModel>((set, get) => ({
    // Initial state
    isInitialized: false,
    isInitializing: false,
    isCameraActive: false,
    isStartingCamera: false,
    lastDetectionResult: null,
    error: null,
    videoElement: null,
    canvasElement: null,
    stream: null,

    // Initialize MediaPipe Face Landmarker
    initialize: async (config?: FaceScannerConfig) => {
      const state = get();
      if (state.isInitialized || state.isInitializing) {
        return;
      }

      set({ isInitializing: true, error: null });

      try {
        const faceLandmarker = await initializeFaceLandmarker(config);
        internal.faceLandmarker = faceLandmarker;

        set({
          isInitialized: true,
          isInitializing: false
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to initialize';
        set({
          isInitializing: false,
          error: errorMessage
        });
        throw error;
      }
    },

    // Start camera and begin processing
    startCamera: async (
      videoElement: HTMLVideoElement,
      canvasElement: HTMLCanvasElement,
      config?: CameraConfig
    ) => {
      const state = get();

      if (!state.isInitialized) {
        throw new Error('Face scanner must be initialized before starting camera');
      }

      if (state.isCameraActive || state.isStartingCamera) {
        return;
      }

      set({ isStartingCamera: true, error: null });

      try {
        // Initialize camera stream
        const stream = await initializeCameraStream(config);

        // Attach stream to video element
        await attachStreamToVideo(videoElement, stream);

        // Store references
        set({
          videoElement,
          canvasElement,
          stream,
          isCameraActive: true,
          isStartingCamera: false
        });

        // Start processing frames
        startFrameProcessing();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to start camera';
        set({
          isStartingCamera: false,
          error: errorMessage
        });
        throw error;
      }
    },

    // Stop camera and cleanup
    stopCamera: () => {
      const state = get();

      // Stop frame processing
      if (internal.animationFrameId !== null) {
        cancelAnimationFrame(internal.animationFrameId);
        internal.animationFrameId = null;
      }

      // Stop media stream
      if (state.stream) {
        stopMediaStream(state.stream);
      }

      // Clear video element
      if (state.videoElement) {
        state.videoElement.srcObject = null;
      }

      // Reset state
      set({
        isCameraActive: false,
        videoElement: null,
        canvasElement: null,
        stream: null,
        lastDetectionResult: null
      });

      internal.lastVideoTime = -1;
    },

    // Set error
    setError: (error: string | null) => {
      set({ error });
    },

    // Clear error
    clearError: () => {
      set({ error: null });
    },

    // Cleanup everything
    cleanup: () => {
      const state = get();

      // Stop camera if active
      if (state.isCameraActive) {
        get().stopCamera();
      }

      // Close MediaPipe
      if (internal.faceLandmarker) {
        internal.faceLandmarker.close();
        internal.faceLandmarker = null;
      }

      // Reset to initial state
      set({
        isInitialized: false,
        isInitializing: false,
        isCameraActive: false,
        isStartingCamera: false,
        lastDetectionResult: null,
        error: null,
        videoElement: null,
        canvasElement: null,
        stream: null
      });

      internal.lastVideoTime = -1;
    }
  }));

  /**
   * Internal function: Start frame processing loop
   */
  function startFrameProcessing() {
    const processFrame = () => {
      const state = store.getState();

      if (!state.isCameraActive || !state.videoElement || !state.canvasElement) {
        return;
      }

      const video = state.videoElement;
      const canvas = state.canvasElement;

      // Check if video is ready and has new frame
      if (video.readyState < 2 || video.currentTime === internal.lastVideoTime) {
        internal.animationFrameId = requestAnimationFrame(processFrame);
        return;
      }

      internal.lastVideoTime = video.currentTime;

      try {
        // Draw mirrored video frame to canvas
        drawMirroredVideoFrame(canvas, video);

        // Detect faces with MediaPipe
        if (internal.faceLandmarker) {
          const timestamp = performance.now();
          const results = internal.faceLandmarker.detectForVideo(video, timestamp);

          // Process detection results
          const detectionResult: FaceDetectionResult = {
            landmarks: results.faceLandmarks || [],
            headPose: null,
            faceCount: results.faceLandmarks?.length || 0,
            timestamp
          };

          // Calculate head pose for first detected face
          if (results.faceLandmarks && results.faceLandmarks.length > 0) {
            const firstFaceLandmarks = results.faceLandmarks[0];
            detectionResult.headPose = getSimplifiedHeadPose(firstFaceLandmarks);
          }

          // Update state with detection results
          store.setState({ lastDetectionResult: detectionResult });
        }
      } catch (error) {
        console.error('Error processing frame:', error);
        const errorMessage = error instanceof Error ? error.message : 'Frame processing error';
        store.setState({ error: errorMessage });
      }

      // Continue processing
      internal.animationFrameId = requestAnimationFrame(processFrame);
    };

    // Start the loop
    internal.animationFrameId = requestAnimationFrame(processFrame);
  }

  return store;
}

/**
 * Type for the store returned by createFaceScannerModel
 */
export type FaceScannerStore = ReturnType<typeof createFaceScannerModel>;
