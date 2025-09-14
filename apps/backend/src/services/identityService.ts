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
  private similarityThreshold = 0.65 // Порог схожести для InsightFace 512D embeddings (оптимизированный)

  constructor() {
    this.identityRepository = AppDataSource.getRepository(Identity)
  }

  /**
   * Найти или создать Identity на основе embedding лица
   */
  async findOrCreateIdentity(faceData: FaceDetectionData): Promise<IdentityMatchResult> {
    // Используем pgvector для быстрого поиска похожих лиц
    const embeddingVector = `[${faceData.embedding.join(',')}]`

    const query = `
      SELECT
        id,
        1 - (embedding <=> $1::vector) as similarity,
        embeddings,
        attributes,
        photos,
        confidence,
        status,
        "createdAt",
        "updatedAt",
        "firstSeen",
        "lastSeen",
        "detectionCount"
      FROM identities
      WHERE embedding IS NOT NULL
        AND status = $2
        AND 1 - (embedding <=> $1::vector) > $3
      ORDER BY embedding <=> $1::vector
      LIMIT 1
    `

    const result = await this.identityRepository.query(query, [
      embeddingVector,
      IdentityStatus.UNVERIFIED,
      this.similarityThreshold
    ])

    if (result && result.length > 0) {
      const matchData = result[0]
      const similarity = parseFloat(matchData.similarity)

      console.log(`🔍 Found matching identity ${matchData.id} with similarity ${similarity.toFixed(3)} using pgvector`)

      // Преобразуем результат в объект Identity
      const bestMatch = this.identityRepository.create({
        id: matchData.id,
        embeddings: matchData.embeddings,
        attributes: matchData.attributes,
        photos: matchData.photos,
        confidence: matchData.confidence,
        status: matchData.status,
        createdAt: matchData.createdAt,
        updatedAt: matchData.updatedAt,
        firstSeen: matchData.firstSeen,
        lastSeen: matchData.lastSeen,
        detectionCount: matchData.detectionCount
      })

      // Обновляем существующий Identity
      await this.updateIdentityWithNewDetection(bestMatch, faceData)

      return {
        identity: bestMatch,
        similarity: similarity,
        isNewIdentity: false
      }
    } else {
      console.log(`✨ Creating new identity (no matches found above threshold ${this.similarityThreshold})`)

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

    // Сохраняем embedding отдельным запросом, так как TypeORM не поддерживает vector тип
    const embeddingVector = `[${faceData.embedding.join(',')}]`
    await this.identityRepository.query(
      'UPDATE identities SET embedding = $1::vector WHERE id = $2',
      [embeddingVector, savedIdentity.id]
    )

    console.log(`✅ Created new identity: ${savedIdentity.id} with embedding vector`)

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

    // Обновляем vector embedding отдельным запросом
    const avgEmbedding = this.calculateAverageEmbedding(identity.embeddings)
    const embeddingVector = `[${avgEmbedding.join(',')}]`
    await this.identityRepository.query(
      'UPDATE identities SET embedding = $1::vector WHERE id = $2',
      [embeddingVector, identity.id]
    )
    console.log(`🔄 Updated identity ${identity.id}, total detections: ${identity.detectionCount}`)
  }

  /**
   * Вычислить среднее embedding из нескольких векторов
   */
  private calculateAverageEmbedding(embeddings: number[][]): number[] {
    if (!embeddings || embeddings.length === 0) {
      throw new Error('Cannot calculate average of empty embeddings array')
    }

    if (embeddings.length === 1) {
      return embeddings[0]
    }

    const embeddingLength = embeddings[0].length
    const avgEmbedding = new Array(embeddingLength).fill(0)

    // Суммируем все embedding векторы
    for (const embedding of embeddings) {
      if (embedding.length !== embeddingLength) {
        console.warn('Embedding dimension mismatch, skipping:', embedding.length, 'vs', embeddingLength)
        continue
      }

      for (let i = 0; i < embeddingLength; i++) {
        avgEmbedding[i] += embedding[i]
      }
    }

    // Усредняем
    for (let i = 0; i < embeddingLength; i++) {
      avgEmbedding[i] /= embeddings.length
    }

    return avgEmbedding
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

  /**
   * Очистить всю базу Identity (ОПАСНАЯ ОПЕРАЦИЯ!)
   */
  async clearAllIdentities(): Promise<{ deleted: number, message: string }> {
    console.log('🗑️ CLEARING ALL IDENTITIES FROM DATABASE (DANGEROUS OPERATION)')
    
    try {
      // Получаем количество записей перед удалением
      const totalCount = await this.identityRepository.count()
      
      if (totalCount === 0) {
        return {
          deleted: 0,
          message: 'База Identity уже пуста'
        }
      }
      
      // Удаляем все записи 
      const allIdentities = await this.identityRepository.find({ select: ['id'] })
      const ids = allIdentities.map(identity => identity.id)
      
      if (ids.length > 0) {
        await this.identityRepository.delete(ids)
      }
      
      console.log(`✅ Successfully cleared ${totalCount} identities from database`)
      
      return {
        deleted: totalCount,
        message: `Успешно удалено ${totalCount} Identity записей из базы данных`
      }
      
    } catch (error) {
      console.error('❌ Error clearing identities:', error)
      throw new Error(`Ошибка при очистке базы данных: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`)
    }
  }
}

// Экспортируем singleton instance
export const identityService = new IdentityService()