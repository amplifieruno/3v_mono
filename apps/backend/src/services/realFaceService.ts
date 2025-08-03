import * as tf from '@tensorflow/tfjs-core'
import '@tensorflow/tfjs-backend-cpu'
import '@tensorflow/tfjs-layers'
import '@tensorflow/tfjs-converter'
import * as blazeface from '@tensorflow-models/blazeface'
import sharp from 'sharp'

interface DetectedFace {
  confidence: number
  x_min: number
  y_min: number
  x_max: number
  y_max: number
  landmarks?: number[][]
  embedding?: number[]
}

interface FaceDetectionResult {
  faces: DetectedFace[]
  processing_time: number
}

class RealFaceService {
  private blazeFaceModel: blazeface.BlazeFaceModel | null = null
  private isInitialized = false
  private processingQueue: Array<{ buffer: Buffer, resolve: Function, reject: Function }> = []
  private isProcessing = false

  async initialize(): Promise<void> {
    try {
      console.log('Initializing TensorFlow.js CPU backend...')
      
      // Set TensorFlow.js backend to CPU
      await tf.setBackend('cpu')
      await tf.ready()
      console.log('TensorFlow.js backend ready:', tf.getBackend())
      
      console.log('Loading BlazeFace model...')
      // Load BlazeFace model for face detection
      this.blazeFaceModel = await blazeface.load()
      console.log('BlazeFace model loaded successfully!')
      
      this.isInitialized = true
      console.log('Real face detection service initialized successfully!')
      
    } catch (error) {
      console.error('Failed to initialize real face service:', error)
      throw error
    }
  }

  async detectFaces(imageBuffer: Buffer): Promise<FaceDetectionResult> {
    // For realtime processing, use queue to prevent memory overflow
    return new Promise((resolve, reject) => {
      this.processingQueue.push({ buffer: imageBuffer, resolve, reject })
      this.processQueue()
    })
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.processingQueue.length === 0) return

    this.isProcessing = true

    while (this.processingQueue.length > 0) {
      const { buffer, resolve, reject } = this.processingQueue.shift()!
      
      try {
        const result = await this.performDetection(buffer)
        resolve(result)
      } catch (error) {
        reject(error)
      }

      // Skip frames if queue is getting too long (> 3 frames)
      if (this.processingQueue.length > 3) {
        console.log(`Dropping ${this.processingQueue.length - 1} frames to maintain performance`)
        // Keep only the latest frame
        const latest = this.processingQueue[this.processingQueue.length - 1]
        this.processingQueue.splice(0, this.processingQueue.length - 1)
        latest.reject(new Error('Frame dropped due to high load'))
      }
    }

    this.isProcessing = false
  }

  private async performDetection(imageBuffer: Buffer): Promise<FaceDetectionResult> {
    const startTime = Date.now()

    if (!this.isInitialized || !this.blazeFaceModel) {
      throw new Error('Real face service not initialized')
    }

    try {
      console.log('Processing image with Sharp...')
      
      // Use Sharp to process the image and get metadata
      const { data, info } = await sharp(imageBuffer)
        .raw()
        .ensureAlpha()
        .toBuffer({ resolveWithObject: true })

      console.log(`Image processed: ${info.width}x${info.height}, ${info.channels} channels`)

      // Convert Sharp buffer to tensor
      // Sharp returns RGBA data, so we need to create a 3D tensor [height, width, channels]
      const imageTensor = tf.tensor3d(
        new Uint8Array(data), 
        [info.height, info.width, info.channels]
      )
      
      console.log('Image tensor created:', imageTensor.shape)

      // BlazeFace expects RGB (3 channels), so slice off alpha if present
      const rgbTensor = info.channels === 4 
        ? tf.slice(imageTensor, [0, 0, 0], [info.height, info.width, 3])
        : imageTensor
      
      console.log('Running BlazeFace prediction...')
      
      // Detect faces using BlazeFace
      const predictions = await this.blazeFaceModel.estimateFaces(rgbTensor as tf.Tensor3D, false)
      
      console.log(`BlazeFace detected ${predictions.length} faces`)

      // Process results
      const faces: DetectedFace[] = predictions.map((prediction: any, index: number) => {
        console.log(`Processing face ${index + 1}:`, {
          topLeft: prediction.topLeft,
          bottomRight: prediction.bottomRight,
          probability: prediction.probability,
          landmarks: prediction.landmarks?.length
        })

        const [x_min, y_min] = prediction.topLeft as number[]
        const [x_max, y_max] = prediction.bottomRight as number[]
        
        return {
          confidence: prediction.probability?.[0] || 0.95,
          x_min: Math.round(x_min),
          y_min: Math.round(y_min),
          x_max: Math.round(x_max),
          y_max: Math.round(y_max),
          landmarks: prediction.landmarks || [],
          embedding: this.generateFaceEmbedding(prediction)
        }
      })

      // Cleanup tensors
      imageTensor.dispose()
      if (rgbTensor !== imageTensor) {
        rgbTensor.dispose()
      }

      const processingTime = Date.now() - startTime
      console.log(`Face detection completed in ${processingTime}ms`)

      return {
        faces,
        processing_time: processingTime
      }

    } catch (error) {
      console.error('Real face detection error:', error)
      throw error
    }
  }

  private generateFaceEmbedding(prediction: any): number[] {
    // For now, generate a deterministic embedding based on face landmarks
    // In a real implementation, this would use a face recognition model like FaceNet
    const landmarks = prediction.landmarks || []
    const embedding = new Array(128).fill(0)
    
    // Create deterministic embedding from landmarks and face box
    const [x_min, y_min] = prediction.topLeft as number[]
    const [x_max, y_max] = prediction.bottomRight as number[]
    
    const seed = x_min + y_min + x_max + y_max + landmarks.length
    
    for (let i = 0; i < 128; i++) {
      // Generate deterministic values based on face characteristics
      const value = Math.sin(seed * (i + 1) * 0.01) * 2
      embedding[i] = value
    }
    
    return embedding
  }

  isReady(): boolean {
    return this.isInitialized && this.blazeFaceModel !== null
  }
}

// Singleton instance
export const faceService = new RealFaceService()