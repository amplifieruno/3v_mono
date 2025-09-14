import * as tf from '@tensorflow/tfjs-core'
import '@tensorflow/tfjs-backend-cpu'
import '@tensorflow/tfjs-layers'
import '@tensorflow/tfjs-converter'
import * as blazeface from '@tensorflow-models/blazeface'
// import * as faceapi from 'face-api.js'
// import { Canvas, createCanvas, CanvasRenderingContext2D } from 'canvas'
import sharp from 'sharp'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { identityService } from './identityService.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Configure face-api.js for Node.js environment
// Note: face-api.js auto-detects node-canvas environment

interface DetectedFace {
  confidence: number
  x_min: number
  y_min: number
  x_max: number
  y_max: number
  landmarks?: number[][]
  embedding?: number[]
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

      // Process results (generate embeddings asynchronously)
      const facePromises = predictions.map(async (prediction: any, index: number) => {
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
          embedding: await this.generateFaceEmbedding(prediction, rgbTensor)
        }
      })

      // Wait for all embeddings to be generated
      const faces: DetectedFace[] = await Promise.all(facePromises)

      // Add Identity information to each detected face
      const facesWithIdentities = await Promise.all(
        faces.map(async (face) => {
          if (face.embedding) {
            try {
              const identityMatch = await identityService.findOrCreateIdentity({
                embedding: face.embedding,
                confidence: face.confidence,
                x_min: face.x_min,
                y_min: face.y_min,
                x_max: face.x_max,
                y_max: face.y_max
              })

              face.identity = {
                id: identityMatch.identity.id,
                similarity: identityMatch.similarity,
                isNewIdentity: identityMatch.isNewIdentity,
                detectionCount: identityMatch.identity.detectionCount,
                firstSeen: identityMatch.identity.firstSeen?.toISOString() || new Date().toISOString(),
                lastSeen: identityMatch.identity.lastSeen?.toISOString() || new Date().toISOString(),
                status: identityMatch.identity.status
              }

              console.log(`👤 Face mapped to identity: ${face.identity.id} (${face.identity.isNewIdentity ? 'NEW' : 'EXISTING'})`)
            } catch (error) {
              console.error('Error processing identity for face:', error)
            }
          }
          return face
        })
      )

      // Cleanup tensors
      imageTensor.dispose()
      if (rgbTensor !== imageTensor) {
        rgbTensor.dispose()
      }

      const processingTime = Date.now() - startTime
      console.log(`Face detection completed in ${processingTime}ms`)

      return {
        faces: facesWithIdentities,
        processing_time: processingTime
      }

    } catch (error) {
      console.error('Real face detection error:', error)
      throw error
    }
  }

  private async generateFaceEmbedding(prediction: any, rgbTensor: tf.Tensor3D): Promise<number[]> {
    // Generate advanced landmark-based embeddings with more sophisticated features
    return this.generateAdvancedEmbedding(prediction, rgbTensor)
  }

  private async generateAdvancedEmbedding(prediction: any, rgbTensor: tf.Tensor3D): Promise<number[]> {
    const [x_min, y_min] = prediction.topLeft as number[]
    const [x_max, y_max] = prediction.bottomRight as number[]
    const landmarks = prediction.landmarks || []
    
    // Extract face region for pixel-level analysis (ensure integer coordinates)
    const faceX = Math.floor(x_min)
    const faceY = Math.floor(y_min)
    const faceWidth = Math.floor(x_max - x_min)
    const faceHeight = Math.floor(y_max - y_min)
    
    // Ensure dimensions are positive and within bounds
    const validX = Math.max(0, Math.min(faceX, rgbTensor.shape[1] - 1))
    const validY = Math.max(0, Math.min(faceY, rgbTensor.shape[0] - 1))
    const validWidth = Math.max(1, Math.min(faceWidth, rgbTensor.shape[1] - validX))
    const validHeight = Math.max(1, Math.min(faceHeight, rgbTensor.shape[0] - validY))
    
    // Extract face pixels for texture analysis
    const faceRegion = tf.slice(rgbTensor, [validY, validX, 0], [validHeight, validWidth, 3])
    const facePixels = await faceRegion.data()
    
    // Create 128-dimensional embedding
    const embedding = new Array(128).fill(0)
    
    // 1. Geometric features from landmarks (dimensions 0-31)
    if (landmarks.length > 0) {
      const normalizedLandmarks = this.normalizeLandmarks(landmarks, validX, validY, validWidth, validHeight)
      for (let i = 0; i < Math.min(32, normalizedLandmarks.length * 2); i += 2) {
        const landmarkIdx = Math.floor(i / 2)
        if (landmarkIdx < normalizedLandmarks.length) {
          embedding[i] = normalizedLandmarks[landmarkIdx][0]
          embedding[i + 1] = normalizedLandmarks[landmarkIdx][1]
        }
      }
    }
    
    // 2. Face shape ratios and proportions (dimensions 32-47)
    embedding[32] = validWidth / validHeight // aspect ratio
    embedding[33] = (validX + validWidth/2) / rgbTensor.shape[1] // center x normalized
    embedding[34] = (validY + validHeight/2) / rgbTensor.shape[0] // center y normalized
    embedding[35] = validWidth / rgbTensor.shape[1] // width ratio
    embedding[36] = validHeight / rgbTensor.shape[0] // height ratio
    
    // Additional geometric features if landmarks available
    if (landmarks.length >= 5) {
      // Eye distance, nose position, mouth width, etc.
      const eyeDistance = this.calculateEyeDistance(landmarks)
      const noseWidth = this.calculateNoseWidth(landmarks)
      const mouthWidth = this.calculateMouthWidth(landmarks)
      
      embedding[37] = eyeDistance / validWidth
      embedding[38] = noseWidth / validWidth
      embedding[39] = mouthWidth / validWidth
    }
    
    // Fill remaining geometric slots with derived features
    for (let i = 40; i < 48; i++) {
      embedding[i] = Math.sin((validWidth + validHeight + i) * 0.01)
    }
    
    // 3. Color/texture histogram features (dimensions 48-79)
    const colorFeatures = this.extractColorFeatures(facePixels, validWidth, validHeight)
    for (let i = 0; i < 32; i++) {
      embedding[48 + i] = colorFeatures[i]
    }
    
    // 4. Texture and gradient features (dimensions 80-111)
    const textureFeatures = this.extractTextureFeatures(facePixels, validWidth, validHeight)
    for (let i = 0; i < 32; i++) {
      embedding[80 + i] = textureFeatures[i]
    }
    
    // 5. Higher-order statistical features (dimensions 112-127)
    const statFeatures = this.extractStatisticalFeatures(facePixels, landmarks, validWidth, validHeight)
    for (let i = 0; i < 16; i++) {
      embedding[112 + i] = statFeatures[i]
    }
    
    // Cleanup tensor
    faceRegion.dispose()
    
    // Normalize embedding to unit vector for consistency
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0))
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude
      }
    }
    
    return embedding
  }

  private normalizeLandmarks(landmarks: number[][], x_min: number, y_min: number, width: number, height: number): number[][] {
    return landmarks.map(([x, y]) => [
      (x - x_min) / width,  // normalize to [0,1] relative to face
      (y - y_min) / height
    ])
  }

  private calculateEyeDistance(landmarks: number[][]): number {
    if (landmarks.length < 2) return 0
    // Approximate eye positions (first two landmarks in BlazeFace)
    const [leftEye, rightEye] = landmarks
    return Math.sqrt(Math.pow(rightEye[0] - leftEye[0], 2) + Math.pow(rightEye[1] - leftEye[1], 2))
  }

  private calculateNoseWidth(landmarks: number[][]): number {
    if (landmarks.length < 4) return 0
    // Use middle landmarks as nose width approximation
    const midPoint1 = landmarks[2]
    const midPoint2 = landmarks[3]
    return Math.abs(midPoint2[0] - midPoint1[0])
  }

  private calculateMouthWidth(landmarks: number[][]): number {
    if (landmarks.length < 6) return 0
    // Use last landmarks as mouth approximation
    const mouthLeft = landmarks[4]
    const mouthRight = landmarks[5]
    return Math.abs(mouthRight[0] - mouthLeft[0])
  }

  private extractColorFeatures(pixels: TypedArray, width: number, height: number): number[] {
    const features = new Array(32).fill(0)
    const totalPixels = width * height
    
    if (totalPixels === 0) return features
    
    // Color channel means and variances
    let rSum = 0, gSum = 0, bSum = 0
    let rSumSq = 0, gSumSq = 0, bSumSq = 0
    
    for (let i = 0; i < totalPixels; i++) {
      const r = pixels[i * 3] / 255
      const g = pixels[i * 3 + 1] / 255  
      const b = pixels[i * 3 + 2] / 255
      
      rSum += r; gSum += g; bSum += b
      rSumSq += r * r; gSumSq += g * g; bSumSq += b * b
    }
    
    // Means
    features[0] = rSum / totalPixels
    features[1] = gSum / totalPixels
    features[2] = bSum / totalPixels
    
    // Variances
    features[3] = (rSumSq / totalPixels) - (features[0] * features[0])
    features[4] = (gSumSq / totalPixels) - (features[1] * features[1])
    features[5] = (bSumSq / totalPixels) - (features[2] * features[2])
    
    // Color histogram (simplified)
    const histR = new Array(8).fill(0)
    const histG = new Array(8).fill(0) 
    const histB = new Array(8).fill(0)
    
    for (let i = 0; i < totalPixels; i++) {
      const r = Math.floor((pixels[i * 3] / 255) * 7)
      const g = Math.floor((pixels[i * 3 + 1] / 255) * 7)
      const b = Math.floor((pixels[i * 3 + 2] / 255) * 7)
      
      histR[r]++; histG[g]++; histB[b]++
    }
    
    // Normalize histograms and add to features
    for (let i = 0; i < 8; i++) {
      features[6 + i] = histR[i] / totalPixels
      features[14 + i] = histG[i] / totalPixels
      features[22 + i] = histB[i] / totalPixels
    }
    
    // Remaining slots: color ratios
    features[30] = features[0] / (features[1] + 0.001) // R/G ratio
    features[31] = features[2] / (features[1] + 0.001) // B/G ratio
    
    return features
  }

  private extractTextureFeatures(pixels: TypedArray, width: number, height: number): number[] {
    const features = new Array(32).fill(0)
    
    if (width < 3 || height < 3) return features
    
    // Simple gradient-based texture features
    let horizontalGradSum = 0, verticalGradSum = 0
    let gradientMagnitudeSum = 0
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 3
        
        // Convert to grayscale for gradient calculation
        const gray = (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3
        const grayLeft = (pixels[idx - 3] + pixels[idx - 2] + pixels[idx - 1]) / 3
        const grayRight = (pixels[idx + 3] + pixels[idx + 4] + pixels[idx + 5]) / 3
        const grayUp = (pixels[((y-1) * width + x) * 3] + pixels[((y-1) * width + x) * 3 + 1] + pixels[((y-1) * width + x) * 3 + 2]) / 3
        const grayDown = (pixels[((y+1) * width + x) * 3] + pixels[((y+1) * width + x) * 3 + 1] + pixels[((y+1) * width + x) * 3 + 2]) / 3
        
        const horizGrad = grayRight - grayLeft
        const vertGrad = grayDown - grayUp
        const magnitude = Math.sqrt(horizGrad * horizGrad + vertGrad * vertGrad)
        
        horizontalGradSum += Math.abs(horizGrad)
        verticalGradSum += Math.abs(vertGrad)
        gradientMagnitudeSum += magnitude
      }
    }
    
    const validPixels = (width - 2) * (height - 2)
    features[0] = horizontalGradSum / validPixels / 255
    features[1] = verticalGradSum / validPixels / 255
    features[2] = gradientMagnitudeSum / validPixels / 255
    
    // Local binary pattern approximation (simplified)
    let lbpSum = 0
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const centerIdx = (y * width + x) * 3
        const centerGray = (pixels[centerIdx] + pixels[centerIdx + 1] + pixels[centerIdx + 2]) / 3
        
        let lbp = 0
        const neighbors = [
          [-1, -1], [-1, 0], [-1, 1],
          [0, 1], [1, 1], [1, 0], [1, -1], [0, -1]
        ]
        
        for (let i = 0; i < neighbors.length; i++) {
          const [dy, dx] = neighbors[i]
          const nIdx = ((y + dy) * width + (x + dx)) * 3
          const nGray = (pixels[nIdx] + pixels[nIdx + 1] + pixels[nIdx + 2]) / 3
          
          if (nGray >= centerGray) {
            lbp |= (1 << i)
          }
        }
        lbpSum += lbp
      }
    }
    
    features[3] = (lbpSum / validPixels) / 255
    
    // Fill remaining texture features with derived values
    for (let i = 4; i < 32; i++) {
      features[i] = Math.sin((horizontalGradSum + verticalGradSum + i) * 0.001)
    }
    
    return features
  }

  private extractStatisticalFeatures(pixels: TypedArray, landmarks: number[][], width: number, height: number): number[] {
    const features = new Array(16).fill(0)
    const totalPixels = width * height
    
    if (totalPixels === 0) return features
    
    // Convert to grayscale for statistical analysis
    const grayPixels = new Array(totalPixels)
    for (let i = 0; i < totalPixels; i++) {
      grayPixels[i] = (pixels[i * 3] + pixels[i * 3 + 1] + pixels[i * 3 + 2]) / 3 / 255
    }
    
    // Statistical moments
    const mean = grayPixels.reduce((sum, val) => sum + val, 0) / totalPixels
    let variance = 0, skewness = 0, kurtosis = 0
    
    for (const pixel of grayPixels) {
      const diff = pixel - mean
      const diff2 = diff * diff
      const diff3 = diff2 * diff
      const diff4 = diff3 * diff
      
      variance += diff2
      skewness += diff3
      kurtosis += diff4
    }
    
    variance /= totalPixels
    const stdDev = Math.sqrt(variance)
    
    if (stdDev > 0) {
      skewness = (skewness / totalPixels) / Math.pow(stdDev, 3)
      kurtosis = (kurtosis / totalPixels) / Math.pow(stdDev, 4)
    }
    
    features[0] = mean
    features[1] = variance
    features[2] = skewness
    features[3] = kurtosis
    
    // Entropy approximation
    const histogram = new Array(256).fill(0)
    for (const pixel of grayPixels) {
      const bin = Math.floor(pixel * 255)
      histogram[bin]++
    }
    
    let entropy = 0
    for (const count of histogram) {
      if (count > 0) {
        const p = count / totalPixels
        entropy -= p * Math.log2(p)
      }
    }
    features[4] = entropy / 8 // normalize
    
    // Landmark-based statistical features
    if (landmarks.length > 0) {
      const landmarkDistances = []
      for (let i = 0; i < landmarks.length - 1; i++) {
        for (let j = i + 1; j < landmarks.length; j++) {
          const dist = Math.sqrt(
            Math.pow(landmarks[j][0] - landmarks[i][0], 2) + 
            Math.pow(landmarks[j][1] - landmarks[i][1], 2)
          )
          landmarkDistances.push(dist)
        }
      }
      
      if (landmarkDistances.length > 0) {
        const distMean = landmarkDistances.reduce((sum, dist) => sum + dist, 0) / landmarkDistances.length
        const distVar = landmarkDistances.reduce((sum, dist) => sum + Math.pow(dist - distMean, 2), 0) / landmarkDistances.length
        
        features[5] = distMean / (width + height) // normalized
        features[6] = distVar / Math.pow(width + height, 2) // normalized
      }
    }
    
    // Fill remaining with derived statistical features
    for (let i = 7; i < 16; i++) {
      features[i] = Math.tanh((mean + variance + i) * 0.1)
    }
    
    return features
  }

  private generateFallbackEmbedding(prediction: any): number[] {
    // Generate deterministic embedding based on face landmarks and position
    const landmarks = prediction.landmarks || []
    const embedding = new Array(128).fill(0)
    
    // Create deterministic embedding from landmarks and face box
    const [x_min, y_min] = prediction.topLeft as number[]
    const [x_max, y_max] = prediction.bottomRight as number[]
    
    // Use face dimensions and landmark positions for more stable embeddings
    const faceWidth = x_max - x_min
    const faceHeight = y_max - y_min
    const faceRatio = faceWidth / faceHeight
    
    // Create feature vector from face characteristics
    let seedValue = x_min * 0.1 + y_min * 0.1 + faceWidth * 0.5 + faceHeight * 0.5 + faceRatio * 10
    
    // Include landmark positions if available
    if (landmarks.length > 0) {
      landmarks.forEach((landmark: number[], idx: number) => {
        if (landmark.length >= 2) {
          seedValue += landmark[0] * 0.01 + landmark[1] * 0.01 + idx
        }
      })
    }
    
    // Generate stable embedding
    for (let i = 0; i < 128; i++) {
      const angle = (seedValue + i) * 0.1
      embedding[i] = Math.sin(angle) * Math.cos(angle * 2) * 2
    }
    
    return embedding
  }

  isReady(): boolean {
    return this.isInitialized && this.blazeFaceModel !== null
  }
}

// Singleton instance
export const faceService = new RealFaceService()