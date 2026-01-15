/**
 * Face Scanner Model (Zustand Store)
 *
 * Manages face detection state, Human library processing, and camera stream.
 * Uses split detection/drawing loops for optimal performance (60fps/30fps).
 *
 * Based on proven implementation from @vladmandic/human with:
 * - 5 positions (center + 4 cardinals)
 * - Normalized -1 to 1 angle range
 * - Dual face box system (start/exit)
 * - Mesh-based face bounds calculation
 */

import { create } from 'zustand';
import type Human from '@vladmandic/human';
import type { Result as HumanResult, FaceResult } from '@vladmandic/human';
import type {
  FaceScannerModel,
  FaceScannerState,
  FaceScannerConfig,
  CameraConfig,
  FaceDetectionResult,
  HeadPose,
  FaceBounds,
} from '../types';
import type {
  ScanningSession,
  ScanningConfig,
  CaptureResult,
  PositionTarget,
  HeadPosePosition,
  FaceBoxConfig,
} from '../types/scanning';
import { initializeHuman } from '../utils/humanUtils';
import {
  initializeCameraStream,
  stopMediaStream,
  attachStreamToVideo,
} from '../utils/cameraUtils';
import { drawMirroredVideoFrame } from '../utils/canvasUtils';
import {
  calculateHeadPoseFromHuman,
  calculateFaceBounds,
} from '../utils/headPoseCalculation';
import {
  DEFAULT_SCAN_POSITIONS,
  DEFAULT_FACE_BOX_CONFIG,
  matchesPosition,
  getNextUncapturedPosition,
  isFaceInBox,
  captureCanvasImage,
  cropHeadImage,
  validateScanningConditions,
  generateSessionId,
} from '../utils/scanningUtils';

/**
 * Internal state that's not exposed via the model interface
 * Stores Human library instance and loop control
 */
interface InternalState {
  human: Human | null;
  detectionFrameId: number | null; // Detection loop (60fps)
  drawingTimeoutId: number | null; // Drawing loop (30fps)
  isProcessing: boolean; // Flag to control loops
  videoElement: HTMLVideoElement | null;
  canvasElement: HTMLCanvasElement | null;
  scanningConfig: ScanningConfig | null;
}

/**
 * Create a new Face Scanner Model (Zustand store factory)
 */
export function createFaceScannerModel() {
  // Internal state outside Zustand store (for non-reactive refs)
  let internal: InternalState = {
    human: null,
    detectionFrameId: null,
    drawingTimeoutId: null,
    isProcessing: false,
    videoElement: null,
    canvasElement: null,
    scanningConfig: null,
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

    // Initialize Human library
    initialize: async (config?: FaceScannerConfig) => {
      const state = get();
      if (state.isInitialized || state.isInitializing) {
        return;
      }

      set({ isInitializing: true, error: null });

      try {
        const human = await initializeHuman(config);
        internal.human = human;

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
        internal.videoElement = videoElement;
        internal.canvasElement = canvasElement;

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
      stopFrameProcessing();

      // Stop media stream
      if (state.stream) {
        stopMediaStream(state.stream);
      }

      // Clear video element
      if (state.videoElement) {
        state.videoElement.srcObject = null;
      }

      // Clear internal refs
      internal.videoElement = null;
      internal.canvasElement = null;

      // Reset state
      set({
        isCameraActive: false,
        videoElement: null,
        canvasElement: null,
        stream: null,
        lastDetectionResult: null,
      });
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
      const scanningConfig: ScanningConfig = {
        holdDuration: config?.holdDuration ?? 1000,
        sessionTimeout: config?.sessionTimeout ?? 120000,
        guideSize: config?.guideSize ?? 0.6,
        captureQuality: config?.captureQuality ?? 0.92,
        cropMultiplier: config?.cropMultiplier ?? 1.5,
        positions: config?.positions ?? DEFAULT_SCAN_POSITIONS,
        faceBoxConfig: config?.faceBoxConfig ?? DEFAULT_FACE_BOX_CONFIG,
        autoStart: config?.autoStart ?? false,
      };

      // Store config for processing
      internal.scanningConfig = scanningConfig;

      // Create new scanning session
      const session: ScanningSession = {
        isScanning: true,
        currentTargetPosition:
          scanningConfig.positions!.find((p) => p.position === 'center') ||
          null,
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
      const positions = internal.scanningConfig?.positions ?? DEFAULT_SCAN_POSITIONS;
      const session: ScanningSession = {
        isScanning: true,
        currentTargetPosition:
          positions.find((p) => p.position === 'center') || null,
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

      // No need to close Human library (it's lightweight)
      internal.human = null;
      internal.scanningConfig = null;

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
    },
  }));

  /**
   * Internal function: Start frame processing loops
   * Split into detection (60fps) and drawing (30fps) for performance
   */
  function startFrameProcessing() {
    internal.isProcessing = true;

    // Start detection loop (60fps)
    startDetectionLoop();

    // Start drawing loop (30fps)
    startDrawingLoop();
  }

  /**
   * Internal function: Stop frame processing loops
   */
  function stopFrameProcessing() {
    internal.isProcessing = false;

    // Cancel detection loop
    if (internal.detectionFrameId !== null) {
      cancelAnimationFrame(internal.detectionFrameId);
      internal.detectionFrameId = null;
    }

    // Cancel drawing loop
    if (internal.drawingTimeoutId !== null) {
      clearTimeout(internal.drawingTimeoutId);
      internal.drawingTimeoutId = null;
    }
  }

  /**
   * Internal function: Detection loop (60fps via requestAnimationFrame)
   * Runs Human library face detection
   */
  function startDetectionLoop() {
    const detect = async () => {
      if (!internal.isProcessing) {
        return;
      }

      const video = internal.videoElement;
      const canvas = internal.canvasElement;

      if (!video || !canvas || !internal.human) {
        internal.detectionFrameId = requestAnimationFrame(detect);
        return;
      }

      // Check if video is ready
      if (video.readyState < 2) {
        internal.detectionFrameId = requestAnimationFrame(detect);
        return;
      }

      try {
        // Run Human library detection
        const result: HumanResult = await internal.human.detect(video);

        // Process detection results
        const detectionResult = processHumanResult(result);

        // Update state with detection results
        store.setState({ lastDetectionResult: detectionResult });

        // Process scanning session if active
        processScanningSession(detectionResult, canvas);
      } catch (error) {
        console.error('Error in detection loop:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'Detection error';
        store.setState({ error: errorMessage });
      }

      // Continue detection loop
      internal.detectionFrameId = requestAnimationFrame(detect);
    };

    // Start the loop
    internal.detectionFrameId = requestAnimationFrame(detect);
  }

  /**
   * Internal function: Drawing loop (30fps via setTimeout)
   * Draws video frame to canvas
   */
  function startDrawingLoop() {
    const draw = () => {
      if (!internal.isProcessing) {
        return;
      }

      const video = internal.videoElement;
      const canvas = internal.canvasElement;

      if (!video || !canvas) {
        internal.drawingTimeoutId = window.setTimeout(draw, 33); // ~30fps
        return;
      }

      // Check if video is ready
      if (video.readyState < 2) {
        internal.drawingTimeoutId = window.setTimeout(draw, 33);
        return;
      }

      try {
        // Draw mirrored video frame to canvas
        drawMirroredVideoFrame(canvas, video);
      } catch (error) {
        console.error('Error in drawing loop:', error);
      }

      // Continue drawing loop (30fps)
      internal.drawingTimeoutId = window.setTimeout(draw, 33);
    };

    // Start the loop
    internal.drawingTimeoutId = window.setTimeout(draw, 33);
  }

  /**
   * Internal function: Process Human library result into FaceDetectionResult
   */
  function processHumanResult(result: HumanResult): FaceDetectionResult {
    const faces = result.face || [];
    const faceCount = faces.length;

    // Process first face if available
    let headPose: HeadPose | null = null;
    let faceBounds: FaceBounds | null = null;

    if (faceCount > 0) {
      const firstFace = faces[0];

      // Calculate head pose from Human rotation data
      headPose = calculateHeadPoseFromHuman(firstFace);

      // Calculate face bounds from mesh landmarks
      if (firstFace.meshRaw && firstFace.meshRaw.length >= 360) {
        try {
          // Convert Point[] to number[][] format: [x, y, z] for each point
          const meshArray = firstFace.meshRaw.map((p) => [p[0], p[1], p[2] || 0]);
          faceBounds = calculateFaceBounds(meshArray);
        } catch (error) {
          console.warn('Failed to calculate face bounds:', error);
        }
      }
    }

    return {
      faces,
      headPose,
      faceBounds,
      faceCount,
      timestamp: performance.now(),
    };
  }

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
    const config = internal.scanningConfig;
    const faceBoxConfig = config?.faceBoxConfig ?? DEFAULT_FACE_BOX_CONFIG;

    // Check session timeout
    if (
      now - session.sessionStartTime >
      (config?.sessionTimeout ?? 120000)
    ) {
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
      detectionResult.faceBounds,
      canvas.width,
      canvas.height,
      faceBoxConfig
    );

    if (validationError) {
      // Reset session on critical errors
      console.warn('Scanning validation error:', validationError);

      // Update session with error but don't reset immediately
      // (allows user to see error message)
      store.setState({
        scanningSession: {
          ...session,
          lastError: validationError,
        },
      });
      return;
    }

    // Clear any previous errors
    if (session.lastError) {
      store.setState({
        scanningSession: {
          ...session,
          lastError: null,
        },
      });
    }

    const headPose = detectionResult.headPose;
    const faceBounds = detectionResult.faceBounds;

    if (!headPose || !faceBounds) {
      return; // No head pose or bounds available
    }

    // Get current target position
    const targetPosition = session.currentTargetPosition;
    if (!targetPosition) {
      // All positions captured - complete session
      const positions = config?.positions ?? DEFAULT_SCAN_POSITIONS;
      if (session.captures.length === positions.length) {
        store.setState({
          scanningSession: {
            ...session,
            isScanning: false,
          },
        });
      }
      return;
    }

    // Check if face is in start box (tight constraint for capture)
    const inStartBox = isFaceInBox(
      faceBounds,
      canvas.width,
      canvas.height,
      faceBoxConfig.startFaceBox
    );

    if (!inStartBox) {
      // Reset hold timer if not in start box
      if (session.holdStartTime !== null) {
        store.setState({
          scanningSession: {
            ...session,
            holdStartTime: null,
          },
        });
      }
      return;
    }

    // Check if current head pose matches target position
    const isMatch = matchesPosition(headPose, targetPosition);

    // Handle center position (requires holding for duration)
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
          (config?.holdDuration ?? 1000)
        ) {
          // Held long enough - capture!
          capturePosition(
            targetPosition,
            headPose,
            detectionResult.faces[0],
            faceBounds,
            canvas,
            config
          );
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
        capturePosition(
          targetPosition,
          headPose,
          detectionResult.faces[0],
          faceBounds,
          canvas,
          config
        );
      }
    }
  }

  /**
   * Internal function: Capture a position
   */
  function capturePosition(
    position: PositionTarget,
    headPose: HeadPose,
    face: FaceResult,
    faceBounds: FaceBounds,
    canvas: HTMLCanvasElement,
    config: ScanningConfig | null
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
        config?.captureQuality ?? 0.92
      );

      // Capture cropped head image
      const headImage = cropHeadImage(
        canvas,
        faceBounds,
        config?.cropMultiplier ?? 1.5,
        config?.captureQuality ?? 0.92
      );

      // Create capture result
      const capture: CaptureResult = {
        id: position.position,
        fullImage,
        headImage,
        headPose: { ...headPose },
        face,
        timestamp: Date.now(),
      };

      // Update session
      const newCapturedPositions = new Set(session.capturedPositions);
      newCapturedPositions.add(position.position);

      const newCaptures = [...session.captures, capture];

      // Get next position to capture
      const positions = config?.positions ?? DEFAULT_SCAN_POSITIONS;
      const nextPosition = getNextUncapturedPosition(
        positions,
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
        `Captured position: ${position.position} (${newCaptures.length}/${positions.length})`
      );
    } catch (error) {
      console.error('Error capturing position:', error);
      store.setState({
        error: error instanceof Error ? error.message : 'Capture failed',
      });
    }
  }

  return store;
}

/**
 * Type for the store returned by createFaceScannerModel
 */
export type FaceScannerStore = ReturnType<typeof createFaceScannerModel>;
