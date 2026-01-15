/**
 * Face Box Helper Utilities
 *
 * Utilities for calculating and validating face bounding boxes
 */

import type { FaceBox, BoxInset } from '../types'

/**
 * Check if a face box is within the specified inset boundaries
 *
 * @param faceBox - The detected face bounding box
 * @param frameWidth - Video frame width in pixels
 * @param frameHeight - Video frame height in pixels
 * @param insets - Boundary insets [top, right, bottom, left] as percentages (0-1)
 * @returns true if face is within boundaries
 */
export function isFaceWithinBounds(
  faceBox: FaceBox,
  frameWidth: number,
  frameHeight: number,
  insets: BoxInset
): boolean {
  const [topInset, rightInset, bottomInset, leftInset] = insets

  const minTop = frameHeight * topInset
  const maxRight = frameWidth * (1 - rightInset)
  const maxBottom = frameHeight * (1 - bottomInset)
  const minLeft = frameWidth * leftInset

  return (
    faceBox.top >= minTop &&
    faceBox.right <= maxRight &&
    faceBox.bottom <= maxBottom &&
    faceBox.left >= minLeft
  )
}

/**
 * Calculate face box from mesh landmarks
 *
 * @param mesh - Array of [x, y, z] coordinates from face mesh
 * @returns Face bounding box
 */
export function calculateFaceBoxFromMesh(mesh: number[][]): FaceBox {
  if (!mesh || mesh.length === 0) {
    return { top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0 }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const point of mesh) {
    const [x, y] = point
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  return {
    left: minX,
    top: minY,
    right: maxX,
    bottom: maxY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

/**
 * Check if face meets minimum size requirements
 *
 * @param faceBox - The detected face bounding box
 * @param frameHeight - Video frame height in pixels
 * @param minHeightRatio - Minimum face height as percentage of frame (0-1)
 * @returns true if face meets minimum size
 */
export function isFaceSizeValid(
  faceBox: FaceBox,
  frameHeight: number,
  minHeightRatio: number
): boolean {
  const minHeight = frameHeight * minHeightRatio
  return faceBox.height >= minHeight
}

/**
 * Calculate the center point of a face box
 *
 * @param faceBox - The face bounding box
 * @returns Center point [x, y]
 */
export function getFaceCenter(faceBox: FaceBox): [number, number] {
  const x = faceBox.left + faceBox.width / 2
  const y = faceBox.top + faceBox.height / 2
  return [x, y]
}

/**
 * Draw debug bounding box on canvas
 *
 * @param ctx - Canvas 2D context
 * @param faceBox - Face bounding box to draw
 * @param color - Box color
 * @param lineWidth - Line width in pixels
 */
export function drawFaceBox(
  ctx: CanvasRenderingContext2D,
  faceBox: FaceBox,
  color = '#00ff00',
  lineWidth = 2
): void {
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.strokeRect(faceBox.left, faceBox.top, faceBox.width, faceBox.height)
}

/**
 * Draw debug boundary insets on canvas
 *
 * @param ctx - Canvas 2D context
 * @param width - Canvas width
 * @param height - Canvas height
 * @param insets - Boundary insets [top, right, bottom, left]
 * @param color - Box color
 */
export function drawBoundaryBox(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  insets: BoxInset,
  color = '#ff0000'
): void {
  const [topInset, rightInset, bottomInset, leftInset] = insets

  const x = width * leftInset
  const y = height * topInset
  const w = width * (1 - leftInset - rightInset)
  const h = height * (1 - topInset - bottomInset)

  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.setLineDash([5, 5])
  ctx.strokeRect(x, y, w, h)
  ctx.setLineDash([])
}
