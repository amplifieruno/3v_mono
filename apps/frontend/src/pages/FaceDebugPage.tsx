import { useState, useRef, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import io, { Socket } from 'socket.io-client'

type DetectionMode = 'snapshot' | 'realtime'

export function FaceDebugPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const streamIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const socketRef = useRef<Socket | null>(null)
  
  const [isStreaming, setIsStreaming] = useState(false)
  const [detectionMode, setDetectionMode] = useState<DetectionMode>('snapshot')
  const [isRealTimeActive, setIsRealTimeActive] = useState(false)
  const [faceDetectionResult, setFaceDetectionResult] = useState<any>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [realtimeStats, setRealtimeStats] = useState({ fps: 0, processed: 0, errors: 0 })
  const [identityStats, setIdentityStats] = useState<any>(null)

  // Initialize WebSocket connection
  useEffect(() => {
    const wsUrl = ''; //import.meta.env.VITE_WS_URL || ''
    socketRef.current = io(wsUrl)
    
    socketRef.current.on('face-detection-result', (result) => {
      setFaceDetectionResult(result)
      setRealtimeStats(prev => ({ 
        ...prev, 
        processed: prev.processed + 1,
        fps: Math.round(1000 / (result.processing_time || 1))
      }))
      drawFaceOverlay(result.faces)
    })
    
    socketRef.current.on('face-detection-error', (error) => {
      console.error('Face detection error:', error)
      setRealtimeStats(prev => ({ ...prev, errors: prev.errors + 1 }))
    })
    
    return () => {
      socketRef.current?.disconnect()
      if (streamIntervalRef.current) {
        clearInterval(streamIntervalRef.current)
      }
    }
  }, [])

  // Load Identity stats on mount and periodically
  useEffect(() => {
    const loadIdentityStats = async () => {
      try {
        const response = await fetch('/api/identities')
        if (response.ok) {
          const data = await response.json()
          setIdentityStats(data.stats)
        }
      } catch (error) {
        console.error('Error loading identity stats:', error)
      }
    }

    loadIdentityStats()
    
    // Reload stats every 10 seconds
    const interval = setInterval(loadIdentityStats, 30000)
    
    return () => clearInterval(interval)
  }, [])

  const drawFaceOverlay = useCallback((faces: any[]) => {
    const canvas = overlayCanvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Calculate scaling factors
    // We send 320x240 images to server, but overlay on full video size
    const scaleX = canvas.width / 320
    const scaleY = canvas.height / 240

    console.log(`Overlay scaling: ${scaleX}x${scaleY} (canvas: ${canvas.width}x${canvas.height})`)

    // Draw bounding boxes for each face
    faces.forEach((face, index) => {
      // Scale coordinates from 320x240 to actual video size
      const scaledX = face.x_min * scaleX
      const scaledY = face.y_min * scaleY
      const scaledWidth = (face.x_max - face.x_min) * scaleX
      const scaledHeight = (face.y_max - face.y_min) * scaleY

      console.log(`Face ${index + 1}: original(${face.x_min},${face.y_min}) -> scaled(${scaledX.toFixed(1)},${scaledY.toFixed(1)})`)

      ctx.strokeStyle = '#00ff00'
      ctx.lineWidth = 3
      ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight)
      
      // Draw confidence with scaled position
      ctx.fillStyle = '#00ff00'
      ctx.font = '16px Arial'
      ctx.fillText(
        `Face ${index + 1}: ${(face.confidence * 100).toFixed(1)}%`,
        scaledX,
        scaledY - 8
      )
    })
  }, [])

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 } 
      })
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        setIsStreaming(true)
        
        // Setup overlay canvas to match video dimensions
        videoRef.current.onloadedmetadata = () => {
          const video = videoRef.current!
          const overlay = overlayCanvasRef.current!
          
          // Set canvas internal dimensions to match video
          overlay.width = video.videoWidth
          overlay.height = video.videoHeight
          
          console.log(`Video dimensions: ${video.videoWidth}x${video.videoHeight}`)
          console.log(`Canvas dimensions: ${overlay.width}x${overlay.height}`)
        }
      }
    } catch (error) {
      console.error('Error accessing camera:', error)
      alert('Could not access camera. Please check permissions.')
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach(track => track.stop())
      videoRef.current.srcObject = null
      setIsStreaming(false)
    }
    stopRealTimeDetection()
  }, [])

  const startRealTimeDetection = useCallback(() => {
    if (!isStreaming || !videoRef.current) return

    setIsRealTimeActive(true)
    setRealtimeStats({ fps: 0, processed: 0, errors: 0 })

    // Capture and send frames every 300ms (roughly 3 FPS)
    streamIntervalRef.current = setInterval(() => {
      captureFrameForRealTime()
    }, 300)
  }, [isStreaming])

  const stopRealTimeDetection = useCallback(() => {
    setIsRealTimeActive(false)
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current)
      streamIntervalRef.current = null
    }
    // Clear overlay
    const canvas = overlayCanvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      ctx?.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [])

  const captureFrameForRealTime = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !socketRef.current) return

    const canvas = canvasRef.current
    const video = videoRef.current
    const ctx = canvas.getContext('2d')
    
    if (!ctx) return

    // Capture frame from video at lower resolution for performance
    canvas.width = 320
    canvas.height = 240
    ctx.drawImage(video, 0, 0, 320, 240)

    // Convert to blob and send via WebSocket
    canvas.toBlob((blob) => {
      if (blob && socketRef.current) {
        const reader = new FileReader()
        reader.onload = () => {
          socketRef.current!.emit('realtime-face-detection', {
            image: reader.result,
            timestamp: Date.now()
          })
        }
        reader.readAsArrayBuffer(blob)
      }
    }, 'image/jpeg', 0.7)
  }, [])

  const captureAndDetect = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return

    setIsProcessing(true)
    
    const canvas = canvasRef.current
    const video = videoRef.current
    const ctx = canvas.getContext('2d')
    
    if (!ctx) return

    // Capture frame from video
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)

    // Convert to blob
    canvas.toBlob(async (blob) => {
      if (!blob) return

      const formData = new FormData()
      formData.append('image', blob, 'capture.jpg')

      try {
        // Send to our backend which will forward to CompreFace
        const response = await fetch('/api/face/detect', {
          method: 'POST',
          body: formData,
        })

        if (response.ok) {
          const result = await response.json()
          setFaceDetectionResult(result)
        } else {
          console.error('Face detection failed:', response.statusText)
        }
      } catch (error) {
        console.error('Error during face detection:', error)
      } finally {
        setIsProcessing(false)
      }
    }, 'image/jpeg', 0.8)
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Face Detection Debug</h1>
        <p className="text-gray-600 mt-2">
          Test face detection and fingerprint generation using CompreFace
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Camera Feed */}
        <Card className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Camera Feed</h2>
            <div className="flex gap-2">
              <Button
                onClick={() => setDetectionMode('snapshot')}
                variant={detectionMode === 'snapshot' ? 'default' : 'outline'}
                size="sm"
              >
                Snapshot
              </Button>
              <Button
                onClick={() => setDetectionMode('realtime')}
                variant={detectionMode === 'realtime' ? 'default' : 'outline'}
                size="sm"
              >
                Real-time
              </Button>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="relative bg-gray-100 rounded-lg overflow-hidden" style={{ aspectRatio: '4/3' }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ display: isStreaming ? 'block' : 'none' }}
              />
              <canvas
                ref={overlayCanvasRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ display: isStreaming && detectionMode === 'realtime' ? 'block' : 'none' }}
              />
              {!isStreaming && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                  Camera not active
                </div>
              )}
            </div>

            {/* Real-time stats */}
            {detectionMode === 'realtime' && isRealTimeActive && (
              <div className="bg-black text-green-400 p-3 rounded font-mono text-sm">
                <div className="grid grid-cols-3 gap-4">
                  <div>FPS: {realtimeStats.fps}</div>
                  <div>Processed: {realtimeStats.processed}</div>
                  <div>Errors: {realtimeStats.errors}</div>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              {!isStreaming ? (
                <Button onClick={startCamera} className="flex-1">
                  Start Camera
                </Button>
              ) : (
                <Button onClick={stopCamera} variant="destructive" className="flex-1">
                  Stop Camera
                </Button>
              )}
              
              {detectionMode === 'snapshot' ? (
                <Button 
                  onClick={captureAndDetect} 
                  disabled={!isStreaming || isProcessing}
                  className="flex-1"
                >
                  {isProcessing ? 'Processing...' : 'Capture & Detect'}
                </Button>
              ) : (
                <Button 
                  onClick={isRealTimeActive ? stopRealTimeDetection : startRealTimeDetection}
                  disabled={!isStreaming}
                  className="flex-1"
                  variant={isRealTimeActive ? 'destructive' : 'default'}
                >
                  {isRealTimeActive ? 'Stop Real-time' : 'Start Real-time'}
                </Button>
              )}
            </div>
          </div>

          {/* Hidden canvas for capture */}
          <canvas ref={canvasRef} className="hidden" />
        </Card>

        {/* Results */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Detection Results</h2>
          
          {faceDetectionResult ? (
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-900">Faces Detected</h3>
                <p className="text-2xl font-bold text-blue-600">
                  {faceDetectionResult.faces?.length || 0}
                </p>
              </div>

              {faceDetectionResult.faces?.map((face: any, index: number) => (
                <div key={index} className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-medium">Face {index + 1}</h4>
                    {face.identity && (
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          face.identity.isNewIdentity 
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-green-100 text-green-800' 
                        }`}>
                          {face.identity.isNewIdentity ? 'NEW' : 'KNOWN'}
                        </span>
                        <span className="text-xs text-gray-500">
                          ID: {face.identity.id.substring(0, 8)}...
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="font-medium">Confidence:</span>
                      <span className="ml-2 text-green-600">
                        {(face.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                    
                    {face.identity && (
                      <div>
                        <span className="font-medium">Similarity:</span>
                        <span className="ml-2 text-blue-600">
                          {(face.identity.similarity * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                    
                    {face.identity && (
                      <div>
                        <span className="font-medium">Detections:</span>
                        <span className="ml-2">{face.identity.detectionCount}</span>
                      </div>
                    )}
                    
                    <div>
                      <span className="font-medium">Position:</span>
                      <span className="ml-2">
                        ({face.x_min}, {face.y_min})
                      </span>
                    </div>

                    {face.identity && (
                      <div className="col-span-2">
                        <span className="font-medium">Status:</span>
                        <span className={`ml-2 px-2 py-1 rounded text-xs ${
                          face.identity.status === 'verified' 
                            ? 'bg-green-100 text-green-800' 
                            : face.identity.status === 'unverified'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {face.identity.status}
                        </span>
                      </div>
                    )}

                    {face.identity && !face.identity.isNewIdentity && (
                      <div className="col-span-2 text-xs text-gray-600">
                        <div>First seen: {new Date(face.identity.firstSeen).toLocaleString()}</div>
                        <div>Last seen: {new Date(face.identity.lastSeen).toLocaleString()}</div>
                      </div>
                    )}
                  </div>

                  {face.embedding && (
                    <div className="mt-2">
                      <span className="font-medium">Embedding:</span>
                      <div className="mt-1 p-2 bg-white rounded text-xs font-mono break-all">
                        [{face.embedding.slice(0, 8).join(', ')}...] (128D)
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              Capture an image to see detection results
            </div>
          )}
        </Card>

        {/* Identity Statistics */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Identity Database</h2>
          
          {identityStats ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{identityStats.total}</div>
                  <div className="text-sm text-gray-600">Total Identities</div>
                </div>
                
                <div className="bg-green-50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{identityStats.verified}</div>
                  <div className="text-sm text-gray-600">Verified</div>
                </div>
                
                <div className="bg-yellow-50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">{identityStats.unverified}</div>
                  <div className="text-sm text-gray-600">Unverified</div>
                </div>
                
                <div className="bg-purple-50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">{identityStats.recentDetections}</div>
                  <div className="text-sm text-gray-600">Recent (1h)</div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-medium mb-2">Distribution</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Verified:</span>
                    <span>{identityStats.total > 0 ? Math.round((identityStats.verified / identityStats.total) * 100) : 0}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Unverified:</span>
                    <span>{identityStats.total > 0 ? Math.round((identityStats.unverified / identityStats.total) * 100) : 0}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Archived:</span>
                    <span>{identityStats.total > 0 ? Math.round((identityStats.archived / identityStats.total) * 100) : 0}%</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              Loading identity statistics...
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}