import * as tf from '@tensorflow/tfjs'
import * as blazeface from '@tensorflow-models/blazeface'
import { createCanvas, loadImage, Image } from 'canvas'

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

class FaceService {
  private blazeFaceModel: blazeface.BlazeFaceModel | null = null
  private isInitialized = false

  async initialize(): Promise<void> {
    try {
      console.log('Initializing face detection models...')
      
      // Initialize TensorFlow.js backend
      await tf.ready()
      
      // Load BlazeFace model for face detection
      this.blazeFaceModel = await blazeface.load()
      
      this.isInitialized = true
      console.log('Face detection models loaded successfully!')
      
    } catch (error) {
      console.error('Failed to initialize face models:', error)
      throw error
    }
  }

  async detectFaces(imageBuffer: Buffer): Promise<FaceDetectionResult> {
    const startTime = Date.now()

    if (!this.isInitialized || !this.blazeFaceModel) {
      throw new Error('Face service not initialized')
    }

    try {
      // Convert buffer to canvas image
      const image = await loadImage(imageBuffer)
      const canvas = createCanvas(image.width, image.height)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(image, 0, 0)

      // Convert canvas to tensor
      const tensor = tf.browser.fromPixels(canvas as any)
      
      // Detect faces using BlazeFace
      const predictions = await this.blazeFaceModel.estimateFaces(tensor, false)
      
      // Process results
      const faces: DetectedFace[] = predictions.map((prediction: any) => {
        const [x_min, y_min] = prediction.topLeft
        const [x_max, y_max] = prediction.bottomRight
        
        return {
          confidence: prediction.probability || 0.95, // BlazeFace doesn't return confidence, using default
          x_min: Math.round(x_min),
          y_min: Math.round(y_min),
          x_max: Math.round(x_max),
          y_max: Math.round(y_max),
          landmarks: prediction.landmarks || [],
          embedding: this.generateMockEmbedding() // TODO: Replace with real face recognition model
        }
      })

      // Cleanup tensor
      tensor.dispose()

      const processingTime = Date.now() - startTime

      return {
        faces,
        processing_time: processingTime
      }

    } catch (error) {
      console.error('Face detection error:', error)
      throw error
    }
  }

  private generateMockEmbedding(): number[] {
    // TODO: Replace with real face recognition model (FaceNet/ArcFace)
    // For now, generate a realistic 128-dimensional embedding
    return Array.from({ length: 128 }, () => Math.random() * 2 - 1)
  }

  isReady(): boolean {
    return this.isInitialized && this.blazeFaceModel !== null
  }
}

// Singleton instance
export const faceService = new FaceService()