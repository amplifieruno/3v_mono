import { Repository, MoreThanOrEqual } from 'typeorm'
import { AppDataSource } from '../config/database.js'
import { Identity, IdentityStatus } from '../entities/Identity.js'

interface FaceDetectionData {
  embedding: number[]
  confidence: number
  image_data?: string // base64 image data
  x_min: number
  y_min: number
  x_max: number
  y_max: number
}

interface IdentityMatchResult {
  identity: Identity
  similarity: number
  isNewIdentity: boolean
}

export class IdentityService {
  private identityRepository: Repository<Identity>
  private similarityThreshold = 0.85 // Порог схожести для считания лиц одинаковыми

  constructor() {
    this.identityRepository = AppDataSource.getRepository(Identity)
  }

  /**
   * Найти или создать Identity на основе embedding лица
   */
  async findOrCreateIdentity(faceData: FaceDetectionData): Promise<IdentityMatchResult> {
    // Ищем похожие лица среди существующих Identity
    const existingIdentities = await this.identityRepository.find({
      where: { status: IdentityStatus.UNVERIFIED },
      order: { lastSeen: 'DESC' },
      take: 100 // Ограничиваем поиск последними 100 Identity для производительности
    })

    let bestMatch: Identity | null = null
    let bestSimilarity = 0

    // Сравниваем с каждым существующим Identity
    for (const identity of existingIdentities) {
      if (!identity.embeddings || identity.embeddings.length === 0) continue

      // Сравниваем с каждым embedding у Identity (может быть несколько)
      for (const storedEmbedding of identity.embeddings) {
        const similarity = this.calculateCosineSimilarity(faceData.embedding, storedEmbedding)
        
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity
          bestMatch = identity
        }
      }
    }

    // Если найдено схожее лицо выше порога
    if (bestMatch && bestSimilarity >= this.similarityThreshold) {
      console.log(`🔍 Found matching identity ${bestMatch.id} with similarity ${bestSimilarity.toFixed(3)}`)
      
      // Обновляем существующий Identity
      await this.updateIdentityWithNewDetection(bestMatch, faceData)
      
      return {
        identity: bestMatch,
        similarity: bestSimilarity,
        isNewIdentity: false
      }
    } else {
      console.log(`✨ Creating new identity (best similarity: ${bestSimilarity.toFixed(3)})`)
      
      // Создаем новый Identity
      const newIdentity = await this.createNewIdentity(faceData)
      
      return {
        identity: newIdentity,
        similarity: 1.0,
        isNewIdentity: true
      }
    }
  }

  /**
   * Создать новый Identity
   */
  private async createNewIdentity(faceData: FaceDetectionData): Promise<Identity> {
    const identity = new Identity()
    identity.embeddings = [faceData.embedding]
    identity.confidence = faceData.confidence
    identity.status = IdentityStatus.UNVERIFIED
    identity.firstSeen = new Date()
    identity.lastSeen = new Date()
    identity.detectionCount = 1
    identity.attributes = {
      last_detection: {
        bbox: {
          x_min: faceData.x_min,
          y_min: faceData.y_min,
          x_max: faceData.x_max,
          y_max: faceData.y_max
        },
        confidence: faceData.confidence,
        timestamp: new Date().toISOString()
      }
    }

    // Если есть данные изображения, сохраняем первое фото
    if (faceData.image_data) {
      identity.photos = [faceData.image_data]
    }

    const savedIdentity = await this.identityRepository.save(identity)
    console.log(`✅ Created new identity: ${savedIdentity.id}`)
    
    return savedIdentity
  }

  /**
   * Обновить существующий Identity новым обнаружением
   */
  private async updateIdentityWithNewDetection(identity: Identity, faceData: FaceDetectionData): Promise<void> {
    // Добавляем новый embedding (максимум 5 для производительности)
    if (!identity.embeddings) identity.embeddings = []
    
    identity.embeddings.push(faceData.embedding)
    if (identity.embeddings.length > 5) {
      identity.embeddings = identity.embeddings.slice(-5) // Оставляем последние 5
    }

    // Обновляем статистику
    identity.lastSeen = new Date()
    identity.detectionCount += 1
    identity.confidence = Math.max(identity.confidence, faceData.confidence)

    // Обновляем атрибуты
    if (!identity.attributes) identity.attributes = {}
    identity.attributes.last_detection = {
      bbox: {
        x_min: faceData.x_min,
        y_min: faceData.y_min,
        x_max: faceData.x_max,
        y_max: faceData.y_max
      },
      confidence: faceData.confidence,
      timestamp: new Date().toISOString()
    }

    // Добавляем фото если есть (максимум 3)
    if (faceData.image_data) {
      if (!identity.photos) identity.photos = []
      identity.photos.push(faceData.image_data)
      if (identity.photos.length > 3) {
        identity.photos = identity.photos.slice(-3) // Оставляем последние 3
      }
    }

    await this.identityRepository.save(identity)
    console.log(`🔄 Updated identity ${identity.id}, total detections: ${identity.detectionCount}`)
  }

  /**
   * Вычислить косинусное сходство между двумя векторами embeddings
   */
  private calculateCosineSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      console.warn('Embedding dimensions mismatch:', embedding1.length, 'vs', embedding2.length)
      return 0
    }

    let dotProduct = 0
    let norm1 = 0
    let norm2 = 0

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i]
      norm1 += embedding1[i] * embedding1[i]
      norm2 += embedding2[i] * embedding2[i]
    }

    const magnitude1 = Math.sqrt(norm1)
    const magnitude2 = Math.sqrt(norm2)

    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0
    }

    return dotProduct / (magnitude1 * magnitude2)
  }

  /**
   * Получить все Identity с базовой информацией
   */
  async getAllIdentities(): Promise<Identity[]> {
    return await this.identityRepository.find({
      order: { lastSeen: 'DESC' },
      take: 50 // Ограничиваем для производительности
    })
  }

  /**
   * Получить Identity по ID
   */
  async getIdentityById(id: string): Promise<Identity | null> {
    return await this.identityRepository.findOne({ where: { id } })
  }

  /**
   * Обновить порог схожести
   */
  setSimilarityThreshold(threshold: number): void {
    this.similarityThreshold = Math.max(0, Math.min(1, threshold))
    console.log(`🎯 Similarity threshold updated to: ${this.similarityThreshold}`)
  }

  /**
   * Получить статистику по Identity
   */
  async getIdentityStats(): Promise<{
    total: number
    verified: number
    unverified: number
    archived: number
    recentDetections: number
  }> {
    const total = await this.identityRepository.count()
    const verified = await this.identityRepository.count({ 
      where: { status: IdentityStatus.VERIFIED } 
    })
    const unverified = await this.identityRepository.count({ 
      where: { status: IdentityStatus.UNVERIFIED } 
    })
    const archived = await this.identityRepository.count({ 
      where: { status: IdentityStatus.ARCHIVED } 
    })

    // Подсчет недавних обнаружений (за последний час)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const recentDetections = await this.identityRepository.count({
      where: { lastSeen: MoreThanOrEqual(oneHourAgo) }
    })

    return {
      total,
      verified,
      unverified,
      archived,
      recentDetections
    }
  }
}

// Экспортируем singleton instance
export const identityService = new IdentityService()