/**
 * useCameraStream Hook
 *
 * Manages webcam stream lifecycle including permissions, initialization, and cleanup.
 */

import { useState, useCallback, useEffect } from 'react'

export interface UseCameraStreamOptions {
  facingMode?: 'user' | 'environment'
  idealWidth?: number
  idealHeight?: number
}

export interface UseCameraStreamReturn {
  stream: MediaStream | null
  error: Error | null
  isLoading: boolean
  isActive: boolean
  requestCamera: () => Promise<void>
  stopCamera: () => void
}

/**
 * Hook to manage camera stream
 *
 * @param options - Camera configuration options
 * @returns Camera stream state and control functions
 *
 * @example
 * ```tsx
 * const { stream, error, isLoading, requestCamera, stopCamera } = useCameraStream({
 *   facingMode: 'user',
 *   idealWidth: 1280,
 *   idealHeight: 720
 * })
 *
 * useEffect(() => {
 *   requestCamera()
 *   return () => stopCamera()
 * }, [])
 * ```
 */
export function useCameraStream(
  options: UseCameraStreamOptions = {}
): UseCameraStreamReturn {
  const { facingMode = 'user', idealWidth, idealHeight } = options

  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isActive, setIsActive] = useState(false)

  const requestCamera = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode,
          width: idealWidth ? { ideal: idealWidth } : { ideal: document.body.clientWidth },
          height: idealHeight
            ? { ideal: idealHeight }
            : { ideal: document.body.clientHeight },
          // @ts-ignore resizeMode is not yet defined in standard types
          resizeMode: 'none',
        },
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints)
      setStream(mediaStream)
      setIsActive(true)
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Failed to access camera')

      // Provide user-friendly error messages
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          error.message = 'Camera access denied. Please grant permission in your browser settings.'
        } else if (err.name === 'NotFoundError') {
          error.message = 'No camera found on this device.'
        } else if (err.name === 'NotReadableError') {
          error.message = 'Camera is already in use by another application.'
        }
      }

      setError(error)
      setStream(null)
      setIsActive(false)
    } finally {
      setIsLoading(false)
    }
  }, [facingMode, idealWidth, idealHeight])

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => {
        track.stop()
      })
      setStream(null)
      setIsActive(false)
    }
  }, [stream])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => {
          track.stop()
        })
      }
    }
  }, [stream])

  return {
    stream,
    error,
    isLoading,
    isActive,
    requestCamera,
    stopCamera,
  }
}
