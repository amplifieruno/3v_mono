/**
 * Face Scanner Scanning Mask Component
 *
 * Renders iOS FaceID-style circular guide with 4 segmented progress indicators.
 * Each segment represents one cardinal direction (top, right, bottom, left).
 * Each segment contains 15 rectangles forming a 135° arc.
 * Features bouncy animation and gradient fill effect on completion.
 *
 * Based on proven implementation from @vladmandic/human with 5 positions.
 */

import { FC, PropsWithChildren, useEffect } from 'react';
import { useFaceScannerModel, useFaceScannerState } from '../context/face-scanner-context';
import type { ScanningConfig, CaptureResult, HeadPosePosition } from '../types/scanning';
import { ScanningInstruction } from '../types/scanning';
import { DEFAULT_SCAN_POSITIONS } from '../utils/scanningUtils';

interface FaceScannerScanningMaskProps extends PropsWithChildren {
  /**
   * Callback when all 5 positions are captured
   */
  onScanComplete?: (captures: CaptureResult[]) => void;

  /**
   * Callback when an error occurs during scanning
   */
  onError?: (error: string) => void;

  /**
   * Scanning configuration
   */
  config?: ScanningConfig;

  /**
   * Optional CSS class name
   */
  className?: string;

  /**
   * Optional inline styles
   */
  style?: React.CSSProperties;

  /**
   * Color for empty rectangles (not yet captured)
   * @default 'rgba(255, 255, 255, 0.3)'
   */
  emptyColor?: string;

  /**
   * Color for filled rectangles (captured)
   * @default '#00FF00'
   */
  filledColor?: string;

  /**
   * Whether to show instruction text
   * @default true
   */
  showInstructions?: boolean;

  /**
   * Whether to show progress counter (e.g., "3/5")
   * @default true
   */
  showProgress?: boolean;
}

// Constants for segment layout
const RECTANGLES_PER_SEGMENT = 15;
const ARC_ANGLE = 135; // degrees per segment
const RECT_SPACING = 6; // degrees between rectangles
const START_ANGLE = -138; // starting rotation offset

// Rectangle heights for different states
const RECT_HEIGHT = {
  none: 0,      // Not needed yet (future position)
  empty: 10,    // Available to capture
  full: 25      // Captured (with gradient)
};

// Mapping of positions to segment indices (0-3)
const POSITION_TO_SEGMENT: Record<HeadPosePosition, number> = {
  'top': 0,
  'right': 1,
  'bottom': 2,
  'left': 3,
  'center': -1 // Center doesn't have a segment
};

/**
 * Face Scanner Scanning Mask Component
 *
 * Displays a static circular guide with 4 segmented indicators (top, right, bottom, left).
 * Each segment has 15 rectangles forming a 135° arc.
 * Rectangles animate from 10px → 25px with bouncy easing when position is captured.
 * Shows user instructions and progress.
 */
export const FaceScannerScanningMask: FC<FaceScannerScanningMaskProps> = ({
  children,
  onScanComplete,
  onError,
  config,
  className,
  style,
  emptyColor = 'rgba(255, 255, 255, 0.3)',
  filledColor = '#00FF00',
  showInstructions = true,
  showProgress = true
}) => {
  const store = useFaceScannerModel();
  const scanningSession = useFaceScannerState(state => state.scanningSession);
  const isInitialized = useFaceScannerState(state => state.isInitialized);
  const isCameraActive = useFaceScannerState(state => state.isCameraActive);
  const error = useFaceScannerState(state => state.error);

  // Start scanning when camera is active and config provided
  useEffect(() => {
    if (isInitialized && isCameraActive && !scanningSession) {
      // Start scanning session
      store.getState().startScanning(config);
    }
  }, [isInitialized, isCameraActive, scanningSession, config, store]);

  // Handle scan completion
  useEffect(() => {
    if (scanningSession && !scanningSession.isScanning && scanningSession.captures.length === 5) {
      if (onScanComplete) {
        onScanComplete(scanningSession.captures);
      }
    }
  }, [scanningSession, onScanComplete]);

  // Handle errors
  useEffect(() => {
    if (error && onError) {
      onError(error);
    }
  }, [error, onError]);

  // Calculate guide size
  const guideSize = config?.guideSize ?? 0.6;
  const guideSizePercent = guideSize * 100;

  // Get current instruction
  const getInstruction = (): string => {
    if (!isCameraActive) {
      return ScanningInstruction.POSITION_FACE;
    }

    if (!scanningSession || !scanningSession.isScanning) {
      return '';
    }

    if (scanningSession.lastError) {
      // Show specific error messages
      switch (scanningSession.lastError) {
        case 'face_lost':
          return ScanningInstruction.FACE_LOST;
        case 'multiple_faces':
          return ScanningInstruction.MULTIPLE_FACES;
        case 'out_of_bounds':
          return ScanningInstruction.OUT_OF_BOUNDS;
        default:
          return ScanningInstruction.ERROR;
      }
    }

    const currentTarget = scanningSession.currentTargetPosition;
    if (!currentTarget) {
      return ScanningInstruction.COMPLETE;
    }

    if (currentTarget.position === 'center') {
      if (scanningSession.holdStartTime !== null) {
        return ScanningInstruction.HOLD_STILL;
      }
      return ScanningInstruction.POSITION_FACE;
    }

    if (scanningSession.captures.length === 1) {
      return ScanningInstruction.ROTATE_HEAD;
    }

    return ScanningInstruction.KEEP_ROTATING;
  };

  const instruction = getInstruction();
  const capturedCount = scanningSession?.captures.length ?? 0;
  const totalPositions = DEFAULT_SCAN_POSITIONS.length;

  // Render a single segment (15 rectangles in 135° arc)
  const renderSegment = (segmentIndex: number) => {
    // Map segment index to position
    const position: HeadPosePosition =
      segmentIndex === 0 ? 'top' :
      segmentIndex === 1 ? 'right' :
      segmentIndex === 2 ? 'bottom' : 'left';

    const isCaptured = scanningSession?.capturedPositions.has(position) ?? false;
    const centerCaptured = scanningSession?.capturedPositions.has('center') ?? false;

    // Determine segment state
    let segmentState: 'none' | 'empty' | 'full';
    if (isCaptured) {
      segmentState = 'full';
    } else if (centerCaptured) {
      segmentState = 'empty'; // Available after center is captured
    } else {
      segmentState = 'none'; // Not yet available
    }

    // Calculate base angle for this segment
    const baseAngle = START_ANGLE + (segmentIndex * 90);

    // Generate 15 rectangles
    const rectangles = [];
    for (let i = 0; i < RECTANGLES_PER_SEGMENT; i++) {
      const angle = baseAngle + (i * RECT_SPACING);
      const angleRad = (angle * Math.PI) / 180;

      // Position on circle (radius 90 from center at 100, 100)
      const radius = 90;
      const centerX = 100;
      const centerY = 100;
      const x = centerX + radius * Math.cos(angleRad);
      const y = centerY + radius * Math.sin(angleRad);

      // Determine rectangle height
      let height = RECT_HEIGHT[segmentState];

      // Gradient effect: edge rectangles slightly shorter for filled state
      if (segmentState === 'full') {
        // Edge rectangles (0-2 and 12-14) have gradient height
        if (i <= 2 || i >= 12) {
          const edgeDistance = Math.min(i, RECTANGLES_PER_SEGMENT - 1 - i);
          height = 13 + edgeDistance * 4; // 13, 17, 21, ..., 25
        }
      }

      // Color
      const color = segmentState === 'full' ? filledColor : emptyColor;

      rectangles.push(
        <rect
          key={`${segmentIndex}-${i}`}
          x={x - 2}
          y={y - height / 2}
          width={4}
          height={height}
          fill={color}
          rx={2}
          ry={2}
          style={{
            transition: 'height 0.5s cubic-bezier(0.47, 1.64, 0.41, 0.8)', // Bouncy easing
            transformOrigin: `${x}px ${y}px`
          }}
        />
      );
    }

    return rectangles;
  };

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        ...style
      }}
    >
      {children}

      {/* Circular guide overlay with 4 segments */}
      <svg
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: `${guideSizePercent}%`,
          height: `${guideSizePercent}%`,
          pointerEvents: 'none'
        }}
        viewBox="0 0 200 200"
      >
        {/* Render 4 segments (top, right, bottom, left) */}
        {[0, 1, 2, 3].map(segmentIndex => (
          <g key={segmentIndex}>
            {renderSegment(segmentIndex)}
          </g>
        ))}
      </svg>

      {/* Instruction text */}
      {showInstructions && instruction && (
        <div
          style={{
            position: 'absolute',
            bottom: '10%',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '0.75rem 1.5rem',
            background: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            textAlign: 'center',
            maxWidth: '80%',
            pointerEvents: 'none'
          }}
        >
          {instruction}
        </div>
      )}

      {/* Progress counter */}
      {showProgress && scanningSession?.isScanning && (
        <div
          style={{
            position: 'absolute',
            top: '10%',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '0.5rem 1rem',
            background: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            fontWeight: 'bold',
            pointerEvents: 'none'
          }}
        >
          {capturedCount}/{totalPositions}
        </div>
      )}
    </div>
  );
};
