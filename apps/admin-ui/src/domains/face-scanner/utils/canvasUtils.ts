/**
 * Canvas Utilities
 *
 * Helper functions for drawing video frames and overlays on canvas
 */

/**
 * Draw video frame to canvas with horizontal mirroring
 * This creates a "selfie" view that users are familiar with
 */
export function drawMirroredVideoFrame(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D context from canvas');
  }

  // Set canvas size to match video dimensions
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }

  // Save current context state
  ctx.save();

  // Mirror horizontally (flip around Y-axis)
  ctx.scale(-1, 1);
  ctx.translate(-canvas.width, 0);

  // Draw video frame
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // Restore context state
  ctx.restore();
}

/**
 * Clear canvas
 */
export function clearCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/**
 * Setup canvas for high-DPI displays
 */
export function setupHighDPICanvas(canvas: HTMLCanvasElement): void {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(dpr, dpr);
  }
}
