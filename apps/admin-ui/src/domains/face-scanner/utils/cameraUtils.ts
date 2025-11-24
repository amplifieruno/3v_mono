/**
 * Camera Utilities
 *
 * Helper functions for initializing and managing camera streams
 */

import type { CameraConfig } from '../types';

/**
 * Initialize camera stream with optional configuration
 * Uses getUserMedia to access the webcam
 */
export async function initializeCameraStream(config?: CameraConfig): Promise<MediaStream> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('getUserMedia is not supported in this browser');
  }

  const constraints: MediaStreamConstraints = {
    video: {
      facingMode: config?.facingMode || 'user',
      ...(config?.width && { width: { ideal: config.width } }),
      ...(config?.height && { height: { ideal: config.height } }),
      ...(config?.frameRate && { frameRate: { ideal: config.frameRate } })
    },
    audio: false
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    return stream;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to access camera: ${error.message}`);
    }
    throw new Error('Failed to access camera: Unknown error');
  }
}

/**
 * Stop all tracks in a media stream
 */
export function stopMediaStream(stream: MediaStream): void {
  stream.getTracks().forEach(track => {
    track.stop();
  });
}

/**
 * Attach media stream to a video element and wait for it to be ready
 */
export async function attachStreamToVideo(
  videoElement: HTMLVideoElement,
  stream: MediaStream
): Promise<void> {
  return new Promise((resolve, reject) => {
    videoElement.srcObject = stream;

    videoElement.onloadedmetadata = () => {
      videoElement.play()
        .then(() => resolve())
        .catch(error => reject(new Error(`Failed to play video: ${error.message}`)));
    };

    videoElement.onerror = () => {
      reject(new Error('Failed to load video metadata'));
    };
  });
}

/**
 * Get actual video dimensions from a video element
 */
export function getVideoDimensions(videoElement: HTMLVideoElement): { width: number; height: number } {
  return {
    width: videoElement.videoWidth,
    height: videoElement.videoHeight
  };
}
