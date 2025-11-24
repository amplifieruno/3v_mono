/**
 * Face Scanner Mask Component
 *
 * Renders an oval mask overlay that follows the detected face.
 * The mask rotates and tilts according to head pose (yaw, pitch, roll).
 * Can accept children for additional overlays.
 */

import { FC, PropsWithChildren } from 'react';
import { useFaceScannerState } from '../context/face-scanner-context';

interface FaceScannerMaskProps extends PropsWithChildren {
  /**
   * Optional CSS class name for the container
   */
  className?: string;

  /**
   * Optional inline styles for the container
   */
  style?: React.CSSProperties;

  /**
   * Whether to show the oval mask
   * @default true
   */
  showMask?: boolean;

  /**
   * Mask color
   * @default 'rgba(255, 255, 255, 0.3)'
   */
  maskColor?: string;

  /**
   * Mask border color
   * @default 'rgba(255, 255, 255, 0.8)'
   */
  maskBorderColor?: string;

  /**
   * Mask border width in pixels
   * @default 2
   */
  maskBorderWidth?: number;
}

/**
 * Face Scanner Mask Component
 *
 * Displays an oval overlay that tracks the detected face position and rotation.
 * Uses CSS 3D transforms to match head pose angles.
 */
export const FaceScannerMask: FC<FaceScannerMaskProps> = ({
  children,
  className,
  style,
  showMask = true,
  maskColor = 'rgba(255, 255, 255, 0.3)',
  maskBorderColor = 'rgba(255, 255, 255, 0.8)',
  maskBorderWidth = 2
}) => {
  // Subscribe to detection results
  const detectionResult = useFaceScannerState(state => state.lastDetectionResult);

  // Calculate mask position and size from face landmarks
  const getMaskTransform = () => {
    if (!detectionResult || !detectionResult.landmarks || detectionResult.landmarks.length === 0) {
      return {
        display: 'none'
      };
    }

    const landmarks = detectionResult.landmarks[0]; // First detected face
    const headPose = detectionResult.headPose;

    if (!landmarks || landmarks.length === 0) {
      return {
        display: 'none'
      };
    }

    // Calculate bounding box from landmarks
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    landmarks.forEach(landmark => {
      minX = Math.min(minX, landmark.x);
      maxX = Math.max(maxX, landmark.x);
      minY = Math.min(minY, landmark.y);
      maxY = Math.max(maxY, landmark.y);
    });

    // Calculate center and size (in normalized coordinates 0-1)
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const width = (maxX - minX) * 1.2; // Add 20% padding
    const height = (maxY - minY) * 1.4; // Add 40% padding for oval shape

    // Convert normalized coordinates to percentages
    // Note: X is mirrored because canvas is mirrored
    const leftPercent = (1 - centerX) * 100;
    const topPercent = centerY * 100;
    const widthPercent = width * 100;
    const heightPercent = height * 100;

    // Build transform string with head pose rotation
    const transforms: string[] = [];

    // Translate to position
    transforms.push('translate(-50%, -50%)');

    // Apply 3D rotations if head pose is available
    if (headPose) {
      // Apply rotations in order: yaw (Y-axis), pitch (X-axis), roll (Z-axis)
      // Note: yaw is negated because canvas is mirrored
      transforms.push(`rotateY(${-headPose.yaw}deg)`);
      transforms.push(`rotateX(${headPose.pitch}deg)`);
      transforms.push(`rotateZ(${headPose.roll}deg)`);
    }

    return {
      position: 'absolute' as const,
      left: `${leftPercent}%`,
      top: `${topPercent}%`,
      width: `${widthPercent}%`,
      height: `${heightPercent}%`,
      transform: transforms.join(' '),
      transformStyle: 'preserve-3d' as const,
      display: 'block'
    };
  };

  const maskStyle = getMaskTransform();

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        perspective: '1000px', // Enable 3D perspective
        ...style
      }}
    >
      {children}

      {/* Oval mask overlay */}
      {showMask && (
        <div
          style={{
            ...maskStyle,
            borderRadius: '50%',
            border: `${maskBorderWidth}px solid ${maskBorderColor}`,
            background: maskColor,
            pointerEvents: 'none',
            transition: 'all 0.1s ease-out'
          }}
        />
      )}
    </div>
  );
};
