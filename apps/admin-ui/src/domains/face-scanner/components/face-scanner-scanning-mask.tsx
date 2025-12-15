/**
 * Face Scanner Scanning Mask Component
 *
 * Renders iOS FaceID-style circular guide with 9 position indicators.
 * Shows static guide overlay with progress indication.
 * Handles scanning session lifecycle and user instructions.
 */

import { FC, PropsWithChildren, useEffect } from 'react';
import { useFaceScannerModel, useFaceScannerState } from '../context/face-scanner-context';
import type { ScanningConfig, CaptureResult } from '../types/scanning';
import { ScanningInstruction } from '../types/scanning';
import { DEFAULT_SCAN_POSITIONS } from '../utils/scanningUtils';

interface FaceScannerScanningMaskProps extends PropsWithChildren {
  /**
   * Callback when all 9 positions are captured
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
   * Pending position indicator color (not yet captured)
   * @default 'rgba(255, 255, 255, 0.3)'
   */
  pendingColor?: string;

  /**
   * Completed position indicator color (captured)
   * @default '#00FF00'
   */
  completedColor?: string;

  /**
   * Active target position indicator color
   * @default 'rgba(255, 255, 0, 0.8)'
   */
  activeColor?: string;

  /**
   * Whether to show instruction text
   * @default true
   */
  showInstructions?: boolean;

  /**
   * Whether to show progress counter (e.g., "3/9")
   * @default true
   */
  showProgress?: boolean;
}

/**
 * Face Scanner Scanning Mask Component
 *
 * Displays a static circular guide with 9 position indicators (iOS FaceID style).
 * Indicators change from gray → green as positions are captured.
 * Shows user instructions and progress.
 */
export const FaceScannerScanningMask: FC<FaceScannerScanningMaskProps> = ({
  children,
  onScanComplete,
  onError,
  config,
  className,
  style,
  pendingColor = 'rgba(255, 255, 255, 0.3)',
  completedColor = '#00FF00',
  activeColor = 'rgba(255, 255, 0, 0.8)',
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
    if (scanningSession && !scanningSession.isScanning && scanningSession.captures.length === 9) {
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

    if (error) {
      return ScanningInstruction.ERROR;
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

      {/* Circular guide overlay */}
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
        {/* Draw 9 position indicators around the circle */}
        {DEFAULT_SCAN_POSITIONS.map((position) => {
          const isCompleted = scanningSession?.capturedPositions.has(position.position) ?? false;
          const isActive = scanningSession?.currentTargetPosition?.position === position.position;

          // Calculate position on circle
          // angle is in degrees, 0 = top, clockwise
          const angleRad = (position.angle - 90) * (Math.PI / 180);
          const radius = 90; // Radius of the guide circle
          const centerX = 100;
          const centerY = 100;

          // Position indicator at this angle
          const x = centerX + radius * Math.cos(angleRad);
          const y = centerY + radius * Math.sin(angleRad);

          // Arc properties for rounded line segment
          const arcLength = isCompleted ? 20 : 12; // Longer when completed
          const arcThickness = isCompleted ? 4 : 3;
          const arcRadius = radius;

          // Calculate start and end angles for arc
          const startAngle = position.angle - arcLength / 2;
          const endAngle = position.angle + arcLength / 2;

          // Convert to radians and calculate path
          const startRad = (startAngle - 90) * (Math.PI / 180);
          const endRad = (endAngle - 90) * (Math.PI / 180);

          const x1 = centerX + arcRadius * Math.cos(startRad);
          const y1 = centerY + arcRadius * Math.sin(startRad);
          const x2 = centerX + arcRadius * Math.cos(endRad);
          const y2 = centerY + arcRadius * Math.sin(endRad);

          // Determine color
          let color = pendingColor;
          if (isCompleted) {
            color = completedColor;
          } else if (isActive) {
            color = activeColor;
          }

          return (
            <g key={position.position}>
              {/* Arc segment */}
              <path
                d={`M ${x1} ${y1} A ${arcRadius} ${arcRadius} 0 0 1 ${x2} ${y2}`}
                fill="none"
                stroke={color}
                strokeWidth={arcThickness}
                strokeLinecap="round"
                style={{
                  transition: 'all 0.3s ease',
                  filter: isActive ? 'drop-shadow(0 0 3px currentColor)' : 'none'
                }}
              />
            </g>
          );
        })}
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
