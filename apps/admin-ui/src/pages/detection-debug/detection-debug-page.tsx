import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import {
  Camera,
  CameraOff,
  Play,
  Square,
  Zap,
  RotateCcw,
  BarChart3,
  Settings,
} from 'lucide-react';
import io, { Socket } from 'socket.io-client';

type DetectionMode = 'snapshot' | 'realtime';

export function DetectionDebugPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const [isStreaming, setIsStreaming] = useState(false);
  const [detectionMode, setDetectionMode] = useState<DetectionMode>('realtime');
  const [activeTab, setActiveTab] = useState('debug');
  const [isRealTimeActive, setIsRealTimeActive] = useState(false);
  const [faceDetectionResult, setFaceDetectionResult] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [realtimeStats, setRealtimeStats] = useState({
    fps: 0,
    processed: 0,
    errors: 0,
  });
  const [sessionStats, setSessionStats] = useState({
    totalDetections: 0,
    uniqueIdentities: new Set<string>(),
    averageConfidence: 0,
    startTime: Date.now(),
    lastDetectionTime: null as number | null,
    facesPerFrame: [] as number[],
    confidenceHistory: [] as number[],
  });

  // Detection settings
  const [settings, setSettings] = useState({
    saveToDatabase: true,
    detectionThreshold: 0.5,
    similarityThreshold: 0.8,
    frameRate: 3, // FPS for real-time detection
    maxImageSize: 320, // Max width/height for processing
    enableIdentityMatching: true,
  });

  // Initialize WebSocket connection
  useEffect(() => {
    const wsUrl = import.meta.env.VITE_WS_URL || '/';
    socketRef.current = io(wsUrl);

    socketRef.current.on('face-detection-result', (result) => {
      setFaceDetectionResult(result);
      setRealtimeStats((prev) => ({
        ...prev,
        processed: prev.processed + 1,
        fps: Math.round(1000 / (result.processing_time || 1)),
      }));

      // Update session statistics
      updateSessionStats(result);
      drawFaceOverlay(result.faces);
    });

    socketRef.current.on('face-detection-error', (error) => {
      console.error('Face detection error:', error);
      setRealtimeStats((prev) => ({ ...prev, errors: prev.errors + 1 }));
    });

    return () => {
      socketRef.current?.disconnect();
      if (streamIntervalRef.current) {
        clearInterval(streamIntervalRef.current);
      }
    };
  }, []);

  // Update session statistics when detection results come in
  const updateSessionStats = useCallback((result: any) => {
    if (!result.faces || result.faces.length === 0) return;

    setSessionStats((prev) => {
      const newUniqueIdentities = new Set(prev.uniqueIdentities);
      const confidences: number[] = [];

      result.faces.forEach((face: any) => {
        confidences.push(face.confidence);
        if (face.identity?.id) {
          newUniqueIdentities.add(face.identity.id);
        }
      });

      const newConfidenceHistory = [
        ...prev.confidenceHistory,
        ...confidences,
      ].slice(-100); // Keep last 100
      const newFacesPerFrame = [
        ...prev.facesPerFrame,
        result.faces.length,
      ].slice(-50); // Keep last 50 frames

      const avgConfidence =
        newConfidenceHistory.length > 0
          ? newConfidenceHistory.reduce((sum, conf) => sum + conf, 0) /
            newConfidenceHistory.length
          : 0;

      return {
        ...prev,
        totalDetections: prev.totalDetections + result.faces.length,
        uniqueIdentities: newUniqueIdentities,
        averageConfidence: avgConfidence,
        lastDetectionTime: Date.now(),
        facesPerFrame: newFacesPerFrame,
        confidenceHistory: newConfidenceHistory,
      };
    });
  }, []);

  // Clear session statistics
  const clearSessionStats = useCallback(() => {
    setSessionStats({
      totalDetections: 0,
      uniqueIdentities: new Set<string>(),
      averageConfidence: 0,
      startTime: Date.now(),
      lastDetectionTime: null,
      facesPerFrame: [],
      confidenceHistory: [],
    });
    setRealtimeStats({ fps: 0, processed: 0, errors: 0 });
  }, []);

  const drawFaceOverlay = useCallback((faces: any[]) => {
    const canvas = overlayCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate scaling factors
    const scaleX = canvas.width / 320;
    const scaleY = canvas.height / 240;

    // Draw bounding boxes for each face
    faces.forEach((face, index) => {
      const scaledX = face.x_min * scaleX;
      const scaledY = face.y_min * scaleY;
      const scaledWidth = (face.x_max - face.x_min) * scaleX;
      const scaledHeight = (face.y_max - face.y_min) * scaleY;

      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 3;
      ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);

      // Draw confidence
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 14px Inter';
      ctx.fillText(
        `Face ${index + 1}: ${(face.confidence * 100).toFixed(1)}%`,
        scaledX,
        scaledY - 8
      );
    });
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsStreaming(true);

        // Setup overlay canvas to match video dimensions
        videoRef.current.onloadedmetadata = () => {
          const video = videoRef.current!;
          const overlay = overlayCanvasRef.current!;

          overlay.width = video.videoWidth;
          overlay.height = video.videoHeight;
        };
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      alert('Could not access camera. Please check permissions.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
      setIsStreaming(false);
    }
    stopRealTimeDetection();
  }, []);

  const startRealTimeDetection = useCallback(() => {
    if (!isStreaming || !videoRef.current) return;

    setIsRealTimeActive(true);
    setRealtimeStats({ fps: 0, processed: 0, errors: 0 });

    // Capture and send frames based on frameRate setting
    const intervalMs = 1000 / settings.frameRate;
    streamIntervalRef.current = setInterval(() => {
      captureFrameForRealTime();
    }, intervalMs);
  }, [isStreaming, settings.frameRate]);

  const stopRealTimeDetection = useCallback(() => {
    setIsRealTimeActive(false);
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
    // Clear overlay
    const canvas = overlayCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  const captureFrameForRealTime = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !socketRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    // Capture frame at configured resolution
    canvas.width = settings.maxImageSize;
    canvas.height =
      (settings.maxImageSize * video.videoHeight) / video.videoWidth;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to blob and send via WebSocket
    canvas.toBlob(
      (blob) => {
        if (blob && socketRef.current) {
          const reader = new FileReader();
          reader.onload = () => {
            socketRef.current!.emit('realtime-face-detection', {
              image: reader.result,
              timestamp: Date.now(),
              settings: settings,
            });
          };
          reader.readAsArrayBuffer(blob);
        }
      },
      'image/jpeg',
      0.7
    );
  }, [settings]);

  const captureAndDetect = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setIsProcessing(true);

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    // Capture frame from video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    // Convert to blob
    canvas.toBlob(
      async (blob) => {
        if (!blob) return;

        const formData = new FormData();
        formData.append('image', blob, 'capture.jpg');
        formData.append('settings', JSON.stringify(settings));

        try {
          const response = await fetch('/api/face/detect', {
            method: 'POST',
            body: formData,
          });

          if (response.ok) {
            const result = await response.json();
            setFaceDetectionResult(result);
            updateSessionStats(result);
          } else {
            console.error('Face detection failed:', response.statusText);
          }
        } catch (error) {
          console.error('Error during face detection:', error);
        } finally {
          setIsProcessing(false);
        }
      },
      'image/jpeg',
      0.8
    );
  }, [updateSessionStats, settings]);

  return (
    <div className='container mx-auto pb-6 space-y-6'>
      <div>
        <h1 className='text-3xl font-bold tracking-tight'>
          Face Detection Debug
        </h1>
        <p className='text-muted-foreground mt-2'>
          Test face detection and fingerprint generation
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className='w-full'>
        <div className='flex items-center justify-between mb-6'>
          <TabsList>
            <TabsTrigger value='debug' className='flex items-center gap-2'>
              <BarChart3 className='h-4 w-4' />
              Debug
            </TabsTrigger>
            <TabsTrigger value='settings' className='flex items-center gap-2'>
              <Settings className='h-4 w-4' />
              Settings
            </TabsTrigger>
          </TabsList>
          {activeTab === 'debug' && (
            <Button
              variant='outline'
              size='sm'
              onClick={clearSessionStats}
              className='flex items-center gap-2'
            >
              <RotateCcw className='h-4 w-4' />
              Clear Analytics
            </Button>
          )}
        </div>

        <TabsContent value='debug' className='mt-0'>
          <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
            {/* Camera Feed */}
            <Card>
              <CardHeader>
                <div className='flex justify-between items-center'>
                  <CardTitle>Camera Feed</CardTitle>
                  <Tabs
                    value={detectionMode}
                    onValueChange={(value) =>
                      setDetectionMode(value as DetectionMode)
                    }
                  >
                    <TabsList>
                      <TabsTrigger value='snapshot'>Snapshot</TabsTrigger>
                      <TabsTrigger value='realtime'>Real-time</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='relative bg-muted rounded-lg overflow-hidden aspect-[4/3]'>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className='w-full h-full object-cover'
                    style={{ display: isStreaming ? 'block' : 'none' }}
                  />
                  <canvas
                    ref={overlayCanvasRef}
                    className='absolute inset-0 w-full h-full pointer-events-none'
                    style={{
                      display:
                        isStreaming && detectionMode === 'realtime'
                          ? 'block'
                          : 'none',
                    }}
                  />
                  {!isStreaming && (
                    <div className='absolute inset-0 flex items-center justify-center text-muted-foreground'>
                      <div className='text-center space-y-2'>
                        <CameraOff className='h-12 w-12 mx-auto' />
                        <p>Camera not active</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Real-time stats */}
                {detectionMode === 'realtime' && isRealTimeActive && (
                  <div className='bg-black text-green-400 p-3 rounded-lg font-mono text-sm'>
                    <div className='grid grid-cols-3 gap-4'>
                      <div>FPS: {realtimeStats.fps}</div>
                      <div>Processed: {realtimeStats.processed}</div>
                      <div>Errors: {realtimeStats.errors}</div>
                    </div>
                  </div>
                )}

                <div className='flex gap-2'>
                  {!isStreaming ? (
                    <Button onClick={startCamera} className='flex-1'>
                      <Camera className='mr-2 h-4 w-4' />
                      Start Camera
                    </Button>
                  ) : (
                    <Button
                      onClick={stopCamera}
                      variant='destructive'
                      className='flex-1'
                    >
                      <CameraOff className='mr-2 h-4 w-4' />
                      Stop Camera
                    </Button>
                  )}

                  {detectionMode === 'snapshot' ? (
                    <Button
                      onClick={captureAndDetect}
                      disabled={!isStreaming || isProcessing}
                      className='flex-1'
                    >
                      {isProcessing ? (
                        <>Processing...</>
                      ) : (
                        <>
                          <Play className='mr-2 h-4 w-4' />
                          Capture & Detect
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={
                        isRealTimeActive
                          ? stopRealTimeDetection
                          : startRealTimeDetection
                      }
                      disabled={!isStreaming}
                      className='flex-1'
                      variant={isRealTimeActive ? 'destructive' : 'default'}
                    >
                      {isRealTimeActive ? (
                        <>
                          <Square className='mr-2 h-4 w-4' />
                          Stop Real-time
                        </>
                      ) : (
                        <>
                          <Zap className='mr-2 h-4 w-4' />
                          Start Real-time
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>

              {/* Hidden canvas for capture */}
              <canvas ref={canvasRef} className='hidden' />
            </Card>

            {/* Results */}
            <Card>
              <CardHeader>
                <CardTitle>Detection Results</CardTitle>
              </CardHeader>
              <CardContent>
                {faceDetectionResult ? (
                  <div className='space-y-4'>
                    <div>
                      <h3 className='text-sm font-medium text-muted-foreground'>
                        Faces Detected
                      </h3>
                      <p className='text-2xl font-bold'>
                        {faceDetectionResult.faces?.length || 0}
                      </p>
                    </div>

                    {faceDetectionResult.faces?.map(
                      (face: any, index: number) => (
                        <div
                          key={index}
                          className='border rounded-lg p-4 space-y-3'
                        >
                          <div className='flex justify-between items-start'>
                            <h4 className='font-medium'>Face {index + 1}</h4>
                            {face.identity && (
                              <div className='flex items-center gap-2'>
                                <Badge
                                  variant={
                                    face.identity.isNewIdentity
                                      ? 'default'
                                      : 'secondary'
                                  }
                                >
                                  {face.identity.isNewIdentity
                                    ? 'NEW'
                                    : 'KNOWN'}
                                </Badge>
                                <span className='text-xs text-muted-foreground'>
                                  ID: {face.identity.id.substring(0, 8)}...
                                </span>
                              </div>
                            )}
                          </div>

                          <div className='grid grid-cols-2 gap-2 text-sm'>
                            <div>
                              <span className='font-medium'>Confidence:</span>
                              <span className='ml-2 text-green-600'>
                                {(face.confidence * 100).toFixed(1)}%
                              </span>
                            </div>

                            {face.identity && (
                              <>
                                <div>
                                  <span className='font-medium'>
                                    Similarity:
                                  </span>
                                  <span className='ml-2 text-blue-600'>
                                    {(face.identity.similarity * 100).toFixed(
                                      1
                                    )}
                                    %
                                  </span>
                                </div>

                                <div>
                                  <span className='font-medium'>
                                    Detections:
                                  </span>
                                  <span className='ml-2'>
                                    {face.identity.detectionCount}
                                  </span>
                                </div>
                              </>
                            )}

                            <div>
                              <span className='font-medium'>Position:</span>
                              <span className='ml-2 text-muted-foreground'>
                                ({face.x_min}, {face.y_min})
                              </span>
                            </div>

                            {face.identity && (
                              <div className='col-span-2'>
                                <span className='font-medium'>Status:</span>
                                <Badge
                                  variant={
                                    face.identity.status === 'verified'
                                      ? 'default'
                                      : face.identity.status === 'unverified'
                                        ? 'secondary'
                                        : 'outline'
                                  }
                                  className='ml-2'
                                >
                                  {face.identity.status}
                                </Badge>
                              </div>
                            )}

                            {face.identity && !face.identity.isNewIdentity && (
                              <div className='col-span-2 text-xs text-muted-foreground space-y-1'>
                                <div>
                                  First seen:{' '}
                                  {new Date(
                                    face.identity.firstSeen
                                  ).toLocaleString()}
                                </div>
                                <div>
                                  Last seen:{' '}
                                  {new Date(
                                    face.identity.lastSeen
                                  ).toLocaleString()}
                                </div>
                              </div>
                            )}
                          </div>

                          {face.embedding && (
                            <div className='space-y-1'>
                              <span className='text-sm font-medium'>
                                Embedding:
                              </span>
                              <div className='p-2 bg-muted rounded text-xs font-mono break-all'>
                                [{face.embedding.slice(0, 8).join(', ')}...]
                                (512D)
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  <div className='text-center py-8 text-muted-foreground'>
                    Capture an image to see detection results
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Session Analytics */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <BarChart3 className='h-5 w-5' />
                  Session Analytics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='space-y-4'>
                  <div className='grid grid-cols-2 gap-3'>
                    <div className='bg-blue-50 dark:bg-blue-950 p-3 rounded-lg'>
                      <div className='text-2xl font-bold text-blue-600 dark:text-blue-400'>
                        {sessionStats.totalDetections}
                      </div>
                      <div className='text-sm text-muted-foreground'>
                        Total Faces
                      </div>
                    </div>

                    <div className='bg-green-50 dark:bg-green-950 p-3 rounded-lg'>
                      <div className='text-2xl font-bold text-green-600 dark:text-green-400'>
                        {sessionStats.uniqueIdentities.size}
                      </div>
                      <div className='text-sm text-muted-foreground'>
                        Unique IDs
                      </div>
                    </div>

                    <div className='bg-yellow-50 dark:bg-yellow-950 p-3 rounded-lg'>
                      <div className='text-2xl font-bold text-yellow-600 dark:text-yellow-400'>
                        {(sessionStats.averageConfidence * 100).toFixed(1)}%
                      </div>
                      <div className='text-sm text-muted-foreground'>
                        Avg Confidence
                      </div>
                    </div>

                    <div className='bg-purple-50 dark:bg-purple-950 p-3 rounded-lg'>
                      <div className='text-2xl font-bold text-purple-600 dark:text-purple-400'>
                        {sessionStats.facesPerFrame.length > 0
                          ? Math.round(
                              (sessionStats.facesPerFrame.reduce(
                                (a, b) => a + b,
                                0
                              ) /
                                sessionStats.facesPerFrame.length) *
                                10
                            ) / 10
                          : 0}
                      </div>
                      <div className='text-sm text-muted-foreground'>
                        Avg Faces/Frame
                      </div>
                    </div>
                  </div>

                  <div className='border-t pt-4 space-y-3'>
                    <div className='flex justify-between text-sm'>
                      <span>Session Duration:</span>
                      <span className='font-medium'>
                        {Math.round(
                          (Date.now() - sessionStats.startTime) / 1000
                        )}
                        s
                      </span>
                    </div>

                    {sessionStats.lastDetectionTime && (
                      <div className='flex justify-between text-sm'>
                        <span>Last Detection:</span>
                        <span className='font-medium'>
                          {Math.round(
                            (Date.now() - sessionStats.lastDetectionTime) / 1000
                          )}
                          s ago
                        </span>
                      </div>
                    )}

                    {sessionStats.confidenceHistory.length > 0 && (
                      <div className='space-y-2'>
                        <div className='flex justify-between text-sm'>
                          <span>Confidence Range:</span>
                          <span className='font-medium'>
                            {(
                              Math.min(...sessionStats.confidenceHistory) * 100
                            ).toFixed(1)}
                            % -{' '}
                            {(
                              Math.max(...sessionStats.confidenceHistory) * 100
                            ).toFixed(1)}
                            %
                          </span>
                        </div>

                        <div className='w-full bg-muted rounded-full h-2'>
                          <div
                            className='bg-green-500 h-2 rounded-full transition-all duration-300'
                            style={{
                              width: `${sessionStats.averageConfidence * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {sessionStats.totalDetections === 0 && (
                      <div className='text-center py-4 text-muted-foreground text-sm'>
                        Start detecting faces to see analytics
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value='settings' className='mt-0'>
          <div className='max-w-2xl'>
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Settings className='h-5 w-5' />
                  Detection Settings
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-6'>
                {/* Save to Database */}
                <div className='space-y-2'>
                  <div className='flex items-center justify-between'>
                    <Label htmlFor='save-db' className='text-sm font-medium'>
                      Save to Database
                    </Label>
                    <Switch
                      id='save-db'
                      checked={settings.saveToDatabase}
                      onCheckedChange={(checked) =>
                        setSettings((prev) => ({
                          ...prev,
                          saveToDatabase: checked,
                        }))
                      }
                    />
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    Store detection results in the database
                  </p>
                </div>

                {/* Detection Threshold */}
                <div className='space-y-3'>
                  <div className='flex items-center justify-between'>
                    <Label className='text-sm font-medium'>
                      Detection Threshold
                    </Label>
                    <span className='text-sm font-mono'>
                      {settings.detectionThreshold.toFixed(2)}
                    </span>
                  </div>
                  <Slider
                    value={[settings.detectionThreshold]}
                    onValueChange={([value]) =>
                      setSettings((prev) => ({
                        ...prev,
                        detectionThreshold: value,
                      }))
                    }
                    min={0.1}
                    max={1.0}
                    step={0.05}
                    className='w-full'
                  />
                  <p className='text-xs text-muted-foreground'>
                    Minimum confidence for face detection
                  </p>
                </div>

                {/* Similarity Threshold */}
                <div className='space-y-3'>
                  <div className='flex items-center justify-between'>
                    <Label className='text-sm font-medium'>
                      Similarity Threshold
                    </Label>
                    <span className='text-sm font-mono'>
                      {settings.similarityThreshold.toFixed(2)}
                    </span>
                  </div>
                  <Slider
                    value={[settings.similarityThreshold]}
                    onValueChange={([value]) =>
                      setSettings((prev) => ({
                        ...prev,
                        similarityThreshold: value,
                      }))
                    }
                    min={0.1}
                    max={1.0}
                    step={0.05}
                    className='w-full'
                  />
                  <p className='text-xs text-muted-foreground'>
                    Minimum similarity for identity matching
                  </p>
                </div>

                {/* Frame Rate */}
                <div className='space-y-3'>
                  <div className='flex items-center justify-between'>
                    <Label className='text-sm font-medium'>
                      Real-time Frame Rate
                    </Label>
                    <span className='text-sm font-mono'>
                      {settings.frameRate} FPS
                    </span>
                  </div>
                  <Slider
                    value={[settings.frameRate]}
                    onValueChange={([value]) =>
                      setSettings((prev) => ({ ...prev, frameRate: value }))
                    }
                    min={1}
                    max={10}
                    step={1}
                    className='w-full'
                  />
                  <p className='text-xs text-muted-foreground'>
                    Frames per second for real-time detection
                  </p>
                </div>

                {/* Identity Matching */}
                <div className='space-y-2'>
                  <div className='flex items-center justify-between'>
                    <Label
                      htmlFor='identity-matching'
                      className='text-sm font-medium'
                    >
                      Identity Matching
                    </Label>
                    <Switch
                      id='identity-matching'
                      checked={settings.enableIdentityMatching}
                      onCheckedChange={(checked) =>
                        setSettings((prev) => ({
                          ...prev,
                          enableIdentityMatching: checked,
                        }))
                      }
                    />
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    Match faces against existing identities
                  </p>
                </div>

                {/* Image Size */}
                <div className='space-y-3'>
                  <div className='flex items-center justify-between'>
                    <Label className='text-sm font-medium'>
                      Processing Size
                    </Label>
                    <span className='text-sm font-mono'>
                      {settings.maxImageSize}px
                    </span>
                  </div>
                  <Slider
                    value={[settings.maxImageSize]}
                    onValueChange={([value]) =>
                      setSettings((prev) => ({ ...prev, maxImageSize: value }))
                    }
                    min={160}
                    max={640}
                    step={80}
                    className='w-full'
                  />
                  <p className='text-xs text-muted-foreground'>
                    Max image width for processing (smaller = faster)
                  </p>
                </div>

                {/* Settings Reset */}
                <div className='pt-4 border-t'>
                  <Button
                    variant='outline'
                    size='sm'
                    className='w-full'
                    onClick={() =>
                      setSettings({
                        saveToDatabase: true,
                        detectionThreshold: 0.5,
                        similarityThreshold: 0.8,
                        frameRate: 3,
                        maxImageSize: 320,
                        enableIdentityMatching: true,
                      })
                    }
                  >
                    Reset to Defaults
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
