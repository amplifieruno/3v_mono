/**
 * Screenshot Helper Utilities
 *
 * Utilities for capturing and converting canvas screenshots to File objects
 */

import type { ScanPosition } from '../types'

/**
 * Convert a data URL to a File object
 *
 * @param dataUrl - Data URL string (e.g., from canvas.toDataURL())
 * @param filename - Output filename
 * @param mimeType - MIME type of the file
 * @returns Promise resolving to File object
 */
export async function dataUrlToFile(
  dataUrl: string,
  filename: string,
  mimeType = 'image/jpeg'
): Promise<File> {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  return new File([blob], filename, { type: mimeType })
}

/**
 * Convert URL to File object (compatible with old urlToFile utility)
 *
 * @param url - URL or data URL
 * @param filename - Output filename
 * @param mimeType - MIME type
 * @returns Promise resolving to File object
 */
export async function urlToFile(
  url: string,
  filename: string,
  mimeType = 'image/jpeg'
): Promise<File> {
  return dataUrlToFile(url, filename, mimeType)
}

/**
 * Capture screenshot from canvas as data URL
 *
 * @param canvas - HTML Canvas element
 * @param quality - JPEG quality (0-1)
 * @returns Data URL string
 */
export function captureCanvasAsDataUrl(canvas: HTMLCanvasElement, quality = 0.92): string {
  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * Capture screenshot from canvas as File
 *
 * @param canvas - HTML Canvas element
 * @param position - Scan position for filename
 * @param quality - JPEG quality (0-1)
 * @returns Promise resolving to File object
 */
export async function captureCanvasAsFile(
  canvas: HTMLCanvasElement,
  position: ScanPosition,
  quality = 0.92
): Promise<File> {
  const dataUrl = captureCanvasAsDataUrl(canvas, quality)
  const filename = `${position}.jpg`
  return dataUrlToFile(dataUrl, filename, 'image/jpeg')
}

/**
 * Convert canvas to blob
 *
 * @param canvas - HTML Canvas element
 * @param mimeType - Output MIME type
 * @param quality - Quality (0-1)
 * @returns Promise resolving to Blob
 */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType = 'image/jpeg',
  quality = 0.92
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Failed to create blob from canvas'))
        }
      },
      mimeType,
      quality
    )
  })
}

/**
 * Resize canvas to specific dimensions
 *
 * @param sourceCanvas - Source canvas to resize
 * @param targetWidth - Target width in pixels
 * @param targetHeight - Target height in pixels
 * @returns New resized canvas
 */
export function resizeCanvas(
  sourceCanvas: HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number
): HTMLCanvasElement {
  const resizedCanvas = document.createElement('canvas')
  resizedCanvas.width = targetWidth
  resizedCanvas.height = targetHeight

  const ctx = resizedCanvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to get 2D context from canvas')
  }

  ctx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight)
  return resizedCanvas
}

/**
 * Create a mirrored (flipped) version of canvas
 *
 * @param sourceCanvas - Source canvas to mirror
 * @returns New mirrored canvas
 */
export function mirrorCanvas(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const mirroredCanvas = document.createElement('canvas')
  mirroredCanvas.width = sourceCanvas.width
  mirroredCanvas.height = sourceCanvas.height

  const ctx = mirroredCanvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to get 2D context from canvas')
  }

  // Flip horizontally
  ctx.translate(mirroredCanvas.width, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(sourceCanvas, 0, 0)

  return mirroredCanvas
}
