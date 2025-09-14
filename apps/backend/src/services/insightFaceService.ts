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
  private processingQueue: Array<{ buffer: Buffer, resolve: Function, reject: Function }> = []
  private isProcessing = false
  
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
      
      const info = await response.json()
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
  
  async detectFaces(imageBuffer: Buffer, fileName = 'image.jpg'): Promise<FaceDetectionResult> {
    // Queue processing to prevent memory overflow in realtime scenarios
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
        console.log(`⚡ Dropping ${this.processingQueue.length - 1} frames to maintain performance`)
        const latest = this.processingQueue[this.processingQueue.length - 1]
        this.processingQueue.splice(0, this.processingQueue.length - 1)
        for (let i = 0; i < this.processingQueue.length - 1; i++) {
          this.processingQueue[i].reject(new Error('Frame dropped due to high load'))
        }
      }
    }
    
    this.isProcessing = false
  }
  
  private async performDetection(imageBuffer: Buffer, fileName = 'image.jpg'): Promise<FaceDetectionResult> {
    const startTime = Date.now()
    
    if (!this.isInitialized) {
      throw new Error('InsightFace service not initialized')
    }
    
    try {
      console.log(`🖼️ Processing image with InsightFace...`)
      
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
      
      const result: InsightFaceResponse = await response.json()

      // InsightFace returns [[face1, face2, ...]] - array of arrays
      if (!result || result.data.length === 0 || !result.data[0] || result.data[0].faces.length === 0) {
        console.log('📷 No faces detected')
        return {
          faces: [],
          processing_time: Date.now() - startTime
        }
      }
      
      const detectedFaces = result.data[0].faces // Get first (and only) image's faces
      console.log(`👤 Detected ${detectedFaces.length} face(s)`)
      
      // Process faces with identity matching
      const faces: DetectedFace[] = await Promise.all(
        detectedFaces.map(async (face) => {
          const processedFace: DetectedFace = {
            confidence: face.prob,
            x_min: Math.round(face.bbox[0]), // x1
            y_min: Math.round(face.bbox[1]), // y1  
            x_max: Math.round(face.bbox[2]), // x2
            y_max: Math.round(face.bbox[3]), // y2
            landmarks: face.landmarks || [],
            embedding: face.vec || [],
            age: undefined, // Age/Gender отключены для производительности
            gender: undefined,
            genderConfidence: undefined
          }
          
          // Match with existing identities using high-quality embeddings
          if (processedFace.embedding && processedFace.embedding.length > 0) {
            try {
              // Extract face crop from original image
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
                image_data: faceCrop // Добавляем изображение лица
              })
              
              processedFace.identity = {
                id: identityMatch.identity.id,
                similarity: identityMatch.similarity,
                isNewIdentity: identityMatch.isNewIdentity,
                detectionCount: identityMatch.identity.detectionCount,
                firstSeen: identityMatch.identity.firstSeen?.toISOString() || new Date().toISOString(),
                lastSeen: identityMatch.identity.lastSeen?.toISOString() || new Date().toISOString(),
                status: identityMatch.identity.status
              }
              
              console.log(`🆔 Identity: ${processedFace.identity.id} (${processedFace.identity.isNewIdentity ? 'NEW' : 'EXISTING'})`)
              console.log(`📊 Similarity: ${processedFace.identity.similarity.toFixed(3)}`)
              
            } catch (error) {
              console.error('❌ Error matching identity:', error)
            }
          }
          
          return processedFace
        })
      )
      
      const processingTime = Date.now() - startTime
      console.log(`⏱️ InsightFace processing completed in ${processingTime}ms`)
      
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