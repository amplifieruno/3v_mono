import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function FaceDebugPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [faceDetectionResult, setFaceDetectionResult] = useState<any>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 } 
      })
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        setIsStreaming(true)
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Camera Feed */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Camera Feed</h2>
          
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
              {!isStreaming && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                  Camera not active
                </div>
              )}
            </div>

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
              
              <Button 
                onClick={captureAndDetect} 
                disabled={!isStreaming || isProcessing}
                className="flex-1"
              >
                {isProcessing ? 'Processing...' : 'Capture & Detect'}
              </Button>
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
                  <h4 className="font-medium mb-2">Face {index + 1}</h4>
                  
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="font-medium">Confidence:</span>
                      <span className="ml-2 text-green-600">
                        {(face.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                    
                    <div>
                      <span className="font-medium">Age:</span>
                      <span className="ml-2">{face.age || 'N/A'}</span>
                    </div>
                    
                    <div>
                      <span className="font-medium">Gender:</span>
                      <span className="ml-2">{face.gender || 'N/A'}</span>
                    </div>
                    
                    <div>
                      <span className="font-medium">Position:</span>
                      <span className="ml-2">
                        ({face.x_min}, {face.y_min})
                      </span>
                    </div>
                  </div>

                  {face.embedding && (
                    <div className="mt-2">
                      <span className="font-medium">Descriptor:</span>
                      <div className="mt-1 p-2 bg-white rounded text-xs font-mono break-all">
                        [{face.embedding.slice(0, 10).join(', ')}...]
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
      </div>
    </div>
  )
}