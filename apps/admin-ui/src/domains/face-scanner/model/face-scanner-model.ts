/**
 * Face Scanner Model (Zustand Store)
 *
 * Manages face detection state, MediaPipe processing, and camera stream.
 * All heavy calculations are extracted to utils.
 */

import { create } from 'zustand';
import type {
  FaceLandmarker,
  NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import type {
  FaceScannerModel,
  FaceScannerState,
  FaceScannerConfig,
  CameraConfig,
  FaceDetectionResult,
  HeadPose,
} from '../types';
import type {
  ScanningSession,
  ScanningConfig,
  CaptureResult,
  PositionTarget,
  HeadPosePosition,
} from '../types/scanning';
import { initializeFaceLandmarker } from '../utils/mediapipeUtils';
import {
  initializeCameraStream,
  stopMediaStream,
  attachStreamToVideo,
} from '../utils/cameraUtils';
import { drawMirroredVideoFrame } from '../utils/canvasUtils';
import {
  calculateHeadPose,
  calculateHeadPose2,
} from '../utils/headPoseCalculation';
import {
  DEFAULT_SCAN_POSITIONS,
  matchesPosition,
  getNextUncapturedPosition,
  captureCanvasImage,
  cropHeadImage,
  validateScanningConditions,
  generateSessionId,
} from '../utils/scanningUtils';

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
    lastVideoTime: -1,
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
    scanningSession: null,

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
          isInitializing: false,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to initialize';
        set({
          isInitializing: false,
          error: errorMessage,
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
        throw new Error(
          'Face scanner must be initialized before starting camera'
        );
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
          isStartingCamera: false,
        });

        // Start processing frames
        startFrameProcessing();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to start camera';
        set({
          isStartingCamera: false,
          error: errorMessage,
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
        lastDetectionResult: null,
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

    // Start scanning session
    startScanning: (config?: ScanningConfig) => {
      const state = get();

      if (!state.isCameraActive) {
        throw new Error('Camera must be active before starting scanning');
      }

      if (state.scanningSession?.isScanning) {
        return; // Already scanning
      }

      // Merge config with defaults
      const scanningConfig: Required<ScanningConfig> = {
        holdDuration: config?.holdDuration ?? 1000,
        sessionTimeout: config?.sessionTimeout ?? 120000,
        positionTolerance: config?.positionTolerance ?? 10,
        guideSize: config?.guideSize ?? 0.6,
        captureQuality: config?.captureQuality ?? 0.92,
        cropMultiplier: config?.cropMultiplier ?? 1.5,
        boundsMargin: config?.boundsMargin ?? 0.9,
        positions: config?.positions ?? DEFAULT_SCAN_POSITIONS,
        autoStart: config?.autoStart ?? false,
      };

      // Create new scanning session
      const session: ScanningSession = {
        isScanning: true,
        currentTargetPosition:
          scanningConfig.positions.find((p) => p.position === 'center') || null,
        capturedPositions: new Set<HeadPosePosition>(),
        captures: [],
        holdStartTime: null,
        sessionStartTime: Date.now(),
        sessionId: generateSessionId(),
        lastError: null,
      };

      set({ scanningSession: session, error: null });
    },

    // Stop scanning session
    stopScanning: () => {
      const state = get();

      if (!state.scanningSession) {
        return;
      }

      set({
        scanningSession: {
          ...state.scanningSession,
          isScanning: false,
        },
      });
    },

    // Reset scanning session (on error or manual reset)
    resetScanning: () => {
      const state = get();

      if (!state.scanningSession) {
        return;
      }

      // Reset to initial state but keep config
      const session: ScanningSession = {
        isScanning: true,
        currentTargetPosition:
          DEFAULT_SCAN_POSITIONS.find((p) => p.position === 'center') || null,
        capturedPositions: new Set<HeadPosePosition>(),
        captures: [],
        holdStartTime: null,
        sessionStartTime: Date.now(),
        sessionId: generateSessionId(),
        lastError: null,
      };

      set({ scanningSession: session, error: null });
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
        stream: null,
        scanningSession: null,
      });

      internal.lastVideoTime = -1;
    },
  }));

  /**
   * Internal function: Process scanning session
   * Handles auto-capture logic for face enrollment
   */
  function processScanningSession(
    detectionResult: FaceDetectionResult,
    canvas: HTMLCanvasElement
  ) {
    const state = store.getState();
    const session = state.scanningSession;

    if (!session || !session.isScanning) {
      return; // No active scanning session
    }

    const now = Date.now();
    const config: ScanningConfig = {
      holdDuration: 1000,
      sessionTimeout: 120000,
      positionTolerance: 10,
      captureQuality: 0.92,
      cropMultiplier: 1.5,
      boundsMargin: 0.9,
    };

    // Check session timeout
    if (now - session.sessionStartTime > (config.sessionTimeout ?? 120000)) {
      store.setState({
        scanningSession: {
          ...session,
          isScanning: false,
          lastError: 'Session timeout',
        },
        error: 'Scanning session timed out',
      });
      return;
    }

    // Validate scanning conditions (face count, bounds, etc.)
    const validationError = validateScanningConditions(
      detectionResult.faceCount,
      detectionResult.landmarks,
      config.boundsMargin ?? 0.9
    );

    if (validationError) {
      // Reset session on error
      console.warn('Scanning validation error:', validationError);
      store.getState().resetScanning();
      return;
    }

    const headPose = detectionResult.headPose;
    if (!headPose) {
      return; // No head pose available
    }

    const landmarks = detectionResult.landmarks[0];
    if (!landmarks) {
      return;
    }

    // Get current target position
    const targetPosition = session.currentTargetPosition;
    if (!targetPosition) {
      // All positions captured - complete session
      if (session.captures.length === DEFAULT_SCAN_POSITIONS.length) {
        store.setState({
          scanningSession: {
            ...session,
            isScanning: false,
          },
        });
      }
      return;
    }

    // Check if current head pose matches target position
    const isMatch = matchesPosition(headPose, targetPosition);

    // Handle center position (requires holding for 1 second)
    if (targetPosition.position === 'center') {
      if (isMatch) {
        if (session.holdStartTime === null) {
          // Start holding timer
          store.setState({
            scanningSession: {
              ...session,
              holdStartTime: now,
            },
          });
        } else if (
          now - session.holdStartTime >=
          (config.holdDuration ?? 1000)
        ) {
          // Held long enough - capture!
          capturePosition(targetPosition, headPose, landmarks, canvas, config);
        }
      } else {
        // Not matching - reset hold timer
        if (session.holdStartTime !== null) {
          store.setState({
            scanningSession: {
              ...session,
              holdStartTime: null,
            },
          });
        }
      }
    } else {
      // Non-center positions - instant capture when matching
      if (isMatch) {
        capturePosition(targetPosition, headPose, landmarks, canvas, config);
      }
    }
  }

  /**
   * Internal function: Capture a position
   */
  function capturePosition(
    position: PositionTarget,
    headPose: HeadPose,
    landmarks: NormalizedLandmark[],
    canvas: HTMLCanvasElement,
    config: ScanningConfig
  ) {
    const state = store.getState();
    const session = state.scanningSession;

    if (!session) {
      return;
    }

    // Check if already captured
    if (session.capturedPositions.has(position.position)) {
      return;
    }

    try {
      // Capture full image
      const fullImage = captureCanvasImage(
        canvas,
        config.captureQuality ?? 0.92
      );

      // Capture cropped head image
      const headImage = cropHeadImage(
        canvas,
        landmarks,
        config.cropMultiplier ?? 1.5,
        config.captureQuality ?? 0.92
      );

      // Create capture result
      const capture: CaptureResult = {
        id: position.position,
        fullImage,
        headImage,
        headPose: { ...headPose },
        landmarks: [[...landmarks]],
        timestamp: Date.now(),
      };

      // Update session
      const newCapturedPositions = new Set(session.capturedPositions);
      newCapturedPositions.add(position.position);

      const newCaptures = [...session.captures, capture];

      // Get next position to capture
      const nextPosition = getNextUncapturedPosition(
        DEFAULT_SCAN_POSITIONS,
        newCapturedPositions
      );

      store.setState({
        scanningSession: {
          ...session,
          capturedPositions: newCapturedPositions,
          captures: newCaptures,
          currentTargetPosition: nextPosition,
          holdStartTime: null,
        },
      });

      console.log(
        `Captured position: ${position.position} (${newCaptures.length}/9)`
      );
    } catch (error) {
      console.error('Error capturing position:', error);
      store.setState({
        error: error instanceof Error ? error.message : 'Capture failed',
      });
    }
  }

  /**
   * Internal function: Start frame processing loop
   */
  function startFrameProcessing() {
    const processFrame = () => {
      const state = store.getState();

      if (
        !state.isCameraActive ||
        !state.videoElement ||
        !state.canvasElement
      ) {
        return;
      }

      const video = state.videoElement;
      const canvas = state.canvasElement;

      // Check if video is ready and has new frame
      if (
        video.readyState < 2 ||
        video.currentTime === internal.lastVideoTime
      ) {
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
          const results = internal.faceLandmarker.detectForVideo(
            video,
            timestamp
          );

          // Process detection results
          const detectionResult: FaceDetectionResult = {
            landmarks: results.faceLandmarks || [],
            headPose: null,
            faceCount: results.faceLandmarks?.length || 0,
            timestamp,
          };

          // Calculate head pose for first detected face
          if (results.faceLandmarks && results.faceLandmarks.length > 0) {
            const firstFaceLandmarks = results.faceLandmarks[0];
            detectionResult.headPose = calculateHeadPose(
              firstFaceLandmarks,
              video.videoWidth,
              video.videoHeight
            );
          }

          // Update state with detection results
          store.setState({ lastDetectionResult: detectionResult });

          // Process scanning session if active
          processScanningSession(detectionResult, canvas);
        }
      } catch (error) {
        console.error('Error processing frame:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'Frame processing error';
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
