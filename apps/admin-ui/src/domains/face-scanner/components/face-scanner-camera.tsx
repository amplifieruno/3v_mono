/**
 * Face Scanner Camera Component
 *
 * Displays the camera view and connects it to the model.
 * This component only handles the visual camera display - all logic is in the model.
 */

import React, { useEffect, useRef } from 'react';
import { useFaceScannerModel, useFaceScannerState } from '../context/face-scanner-context';
import type { CameraConfig } from '../types';

interface FaceScannerCameraProps {
  /**
   * Optional camera configuration
   */
  config?: CameraConfig;

  /**
   * Optional CSS class name
   */
  className?: string;

  /**
   * Optional inline styles
   */
  style?: React.CSSProperties;
}

/**
 * Face Scanner Camera Component
 *
 * Renders a canvas that displays the mirrored camera feed.
 * Automatically starts the camera when the model is initialized.
 */
export const FaceScannerCamera: React.FC<FaceScannerCameraProps> = ({
  config,
  className,
  style
}) => {
  const store = useFaceScannerModel();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Subscribe to relevant state
  const isInitialized = useFaceScannerState(state => state.isInitialized);
  const isCameraActive = useFaceScannerState(state => state.isCameraActive);
  const isStartingCamera = useFaceScannerState(state => state.isStartingCamera);
  const error = useFaceScannerState(state => state.error);

  // Start camera when model is initialized
  useEffect(() => {
    if (
      isInitialized &&
      !isCameraActive &&
      !isStartingCamera &&
      videoRef.current &&
      canvasRef.current
    ) {
      const { startCamera } = store.getState();
      startCamera(videoRef.current, canvasRef.current, config).catch(err => {
        console.error('Failed to start camera:', err);
      });
    }
  }, [isInitialized, isCameraActive, isStartingCamera, config, store]);

  // Stop camera on unmount
  useEffect(() => {
    return () => {
      if (isCameraActive) {
        const { stopCamera } = store.getState();
        stopCamera();
      }
    };
  }, [isCameraActive, store]);

  return (
    <div className={className} style={style}>
      {/* Hidden video element - used for MediaPipe processing */}
      <video
        ref={videoRef}
        style={{ display: 'none' }}
        playsInline
        muted
      />

      {/* Visible canvas - displays mirrored camera feed */}
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          objectFit: 'cover'
        }}
      />

      {/* Error display */}
      {error && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            padding: '1rem',
            background: 'rgba(255, 0, 0, 0.8)',
            color: 'white',
            fontSize: '0.875rem',
            textAlign: 'center'
          }}
        >
          {error}
        </div>
      )}

      {/* Loading indicator */}
      {(isStartingCamera || !isInitialized) && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            padding: '1rem 2rem',
            background: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            borderRadius: '0.5rem',
            fontSize: '0.875rem'
          }}
        >
          {!isInitialized ? 'Initializing...' : 'Starting camera...'}
        </div>
      )}
    </div>
  );
};
