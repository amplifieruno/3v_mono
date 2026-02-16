import fetch from 'node-fetch'
import sharp from 'sharp'
import { identityService } from './identityService.js'

interface InsightFaceBoundingBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

interface InsightFaceLandmarks {
  points: number[][]
}

interface InsightFaceDetection {
  bbox: number[] // [x1, y1, x2, y2] format
  prob: number    // detection confidence
  vec?: number[]  // embedding vector  
  age?: number
  gender?: number // 0=male, 1=female
  landmarks?: number[][]
}

// InsightFace API returns array of arrays of face detections
type InsightFaceResponse = {
  tool: { total_ms: number }
  data: {
    status: string
    took_ms: number
    faces: InsightFaceDetection[]
  }[]
}

interface DetectedFace {
  confidence: number
  x_min: number
  y_min: number
  x_max: number
  y_max: number
  landmarks?: number[][]
  embedding?: number[]
  age?: number
  gender?: string
  genderConfidence?: number
  identity?: {
    id: string
    similarity: number
    isNewIdentity: boolean
    detectionCount: number
    firstSeen: string
    lastSeen: string
    status: string
  }
}

interface FaceDetectionResult {
  faces: DetectedFace[]
  processing_time: number
}

class InsightFaceService {
  private baseUrl: string
  private isInitialized = false
  private isProcessing = false
  private lastProcessedAt = 0
  private readonly MIN_INTERVAL_MS = 500 // minimum gap between frames

  constructor() {
    this.baseUrl = process.env.INSIGHTFACE_API_URL || 'http://localhost:18080'
  }
  
  async initialize(): Promise<void> {
    try {
      console.log('🚀 Initializing InsightFace-REST service...')
      console.log(`📡 API URL: ${this.baseUrl}`)
      
      // Check if service is available
      const response = await fetch(`${this.baseUrl}/info`)
      if (!response.ok) {
        throw new Error(`InsightFace service not available: ${response.status}`)
      }
      
      const info: any = await response.json()
      console.log('✅ InsightFace-REST service connected successfully!')
      console.log('📋 Service info:', {
        version: info.version,
        models: info.models,
        device: info.device
      })
      
      this.isInitialized = true
      
    } catch (error) {
      console.error('❌ Failed to initialize InsightFace service:', error)
      throw error
    }
  }
  
  async detectFaces(imageBuffer: Buffer): Promise<FaceDetectionResult> {
    // Simple backpressure: reject if already processing or too soon after last frame
    if (this.isProcessing) {
      throw new Error('Frame dropped: already processing')
    }
    const elapsed = Date.now() - this.lastProcessedAt
    if (elapsed < this.MIN_INTERVAL_MS) {
      throw new Error('Frame dropped: cooldown')
    }

    this.isProcessing = true
    try {
      const result = await this.performDetection(imageBuffer)
      this.lastProcessedAt = Date.now()
      return result
    } finally {
      this.isProcessing = false
    }
  }
  
  private async performDetection(imageBuffer: Buffer, fileName = 'image.jpg'): Promise<FaceDetectionResult> {
    const startTime = Date.now()
    
    if (!this.isInitialized) {
      throw new Error('InsightFace service not initialized')
    }
    
    try {
      
      // Convert image buffer to base64
      const base64Image = imageBuffer.toString('base64')
      
      // Prepare JSON payload as required by InsightFace API
      const requestBody = {
        images: {
          data: [base64Image]
        },
        max_size: [640, 640],
        threshold: 0.6,
        extract_embedding: true,
        extract_ga: false,
        return_landmarks: false,
        return_face_data: false
      }
      
      const jsonBody = JSON.stringify(requestBody)
      
      // Call InsightFace /extract endpoint with JSON payload
      const response = await fetch(`${this.baseUrl}/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: jsonBody
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`InsightFace API error: ${response.status} - ${errorText}`)
      }
      
      const result = await response.json() as InsightFaceResponse

      // InsightFace returns [[face1, face2, ...]] - array of arrays
      if (!result || result.data.length === 0 || !result.data[0] || result.data[0].faces.length === 0) {
        return {
          faces: [],
          processing_time: Date.now() - startTime
        }
      }
      
      const detectedFaces = result.data[0].faces
      
      // Process faces sequentially to avoid CPU spikes from parallel sharp/pgvector/hasura
      // Limit to first 3 faces per frame to cap resource usage
      const facesToProcess = detectedFaces.slice(0, 3)
      const faces: DetectedFace[] = []

      for (const face of facesToProcess) {
        const processedFace: DetectedFace = {
          confidence: face.prob,
          x_min: Math.round(face.bbox[0]),
          y_min: Math.round(face.bbox[1]),
          x_max: Math.round(face.bbox[2]),
          y_max: Math.round(face.bbox[3]),
          landmarks: face.landmarks || [],
          embedding: face.vec || [],
        }

        if (processedFace.embedding && processedFace.embedding.length > 0) {
          try {
            const faceCrop = await this.extractFaceCrop(
              imageBuffer,
              processedFace.x_min,
              processedFace.y_min,
              processedFace.x_max,
              processedFace.y_max
            )

            const identityMatch = await identityService.findOrCreateIdentity({
              embedding: processedFace.embedding,
              confidence: processedFace.confidence,
              x_min: processedFace.x_min,
              y_min: processedFace.y_min,
              x_max: processedFace.x_max,
              y_max: processedFace.y_max,
              image_data: faceCrop,
            })

            processedFace.identity = {
              id: identityMatch.identity.id,
              similarity: identityMatch.similarity,
              isNewIdentity: identityMatch.isNewIdentity,
              detectionCount: identityMatch.identity.detectionCount,
              firstSeen: identityMatch.identity.firstSeen?.toISOString() || new Date().toISOString(),
              lastSeen: identityMatch.identity.lastSeen?.toISOString() || new Date().toISOString(),
              status: identityMatch.identity.status,
            }
          } catch (error) {
            console.error('[InsightFace] Identity match error:', error instanceof Error ? error.message : error)
          }
        }

        faces.push(processedFace)
      }
      
      const processingTime = Date.now() - startTime
      
      return {
        faces,
        processing_time: processingTime
      }
      
    } catch (error) {
      console.error('❌ InsightFace detection error:', error)
      throw error
    }
  }
  
  isReady(): boolean {
    return this.isInitialized
  }
  
  // Utility method to compute similarity between two face embeddings
  computeSimilarity(embedding1: number[], embedding2: number[]): number {
    if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
      return 0
    }
    
    // Cosine similarity for high-dimensional embeddings
    let dotProduct = 0
    let norm1 = 0
    let norm2 = 0
    
    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i]
      norm1 += embedding1[i] * embedding1[i]
      norm2 += embedding2[i] * embedding2[i]
    }
    
    const magnitude = Math.sqrt(norm1 * norm2)
    return magnitude > 0 ? dotProduct / magnitude : 0
  }
  
  // Get service information
  async getServiceInfo(): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('InsightFace service not initialized')
    }
    
    const response = await fetch(`${this.baseUrl}/info`)
    if (!response.ok) {
      throw new Error(`Failed to get service info: ${response.status}`)
    }

    return response.json()
  }

  /**
   * Extract face crop from image buffer based on bounding box
   */
  private async extractFaceCrop(
    imageBuffer: Buffer,
    x_min: number,
    y_min: number,
    x_max: number,
    y_max: number
  ): Promise<string> {
    try {
      // Add padding to the face crop (10% on each side)
      const padding = 0.1
      const width = x_max - x_min
      const height = y_max - y_min

      const padWidth = Math.round(width * padding)
      const padHeight = Math.round(height * padding)

      const cropX = Math.max(0, x_min - padWidth)
      const cropY = Math.max(0, y_min - padHeight)
      const cropWidth = width + (padWidth * 2)
      const cropHeight = height + (padHeight * 2)

      // Extract face crop using Sharp
      const faceCropBuffer = await sharp(imageBuffer)
        .extract({
          left: Math.round(cropX),
          top: Math.round(cropY),
          width: Math.round(cropWidth),
          height: Math.round(cropHeight)
        })
        .resize(150, 150, { // Resize to standard size
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 80 })
        .toBuffer()

      // Convert to base64 data URL
      const base64 = faceCropBuffer.toString('base64')
      return `data:image/jpeg;base64,${base64}`

    } catch (error) {
      console.error('Error extracting face crop:', error)
      // Return empty data URL if extraction fails
      return ''
    }
  }
}

// Singleton instance
export const insightFaceService = new InsightFaceService()