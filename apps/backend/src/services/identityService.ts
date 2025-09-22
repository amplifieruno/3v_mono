import { Repository } from 'typeorm'
import { AppDataSource } from '../config/database.js'
import { Identity } from '../entities/Identity.js'
import { Profile } from '../entities/Profile.js'

interface FaceDetectionData {
  embedding: number[]
  confidence: number
  image_data?: string // base64 image data
  x_min: number
  y_min: number
  x_max: number
  y_max: number
}

interface CreateIdentityData {
  embedding: number[]
  imageUrl?: string
  profileId?: string
}

interface IdentityMatchResult {
  identity: Identity
  similarity: number
  isNewIdentity: boolean
}

export class IdentityService {
  private identityRepository: Repository<Identity>
  private profileRepository: Repository<Profile>
  private similarityThreshold = 0.50 // Порог схожести для InsightFace 512D embeddings (оптимизированный)

  constructor() {
    this.identityRepository = AppDataSource.getRepository(Identity)
    this.profileRepository = AppDataSource.getRepository(Profile)
  }

  /**
   * Найти или создать Identity на основе embedding лица
   */
  async findOrCreateIdentity(faceData: FaceDetectionData): Promise<IdentityMatchResult> {
    // Используем pgvector для быстрого поиска похожих лиц
    const embeddingVector = `[${faceData.embedding.join(',')}]`

    const query = `
      SELECT *
        FROM (
          SELECT
            id,
            images, attributes, status,
            created_at AS "createdAt",
            updated_at AS "updatedAt",
            profile_id AS "profileId",
            (embedding <=> $1::vector) AS dist
          FROM itap.identities
          WHERE embedding IS NOT NULL
          ORDER BY dist
          LIMIT 1
        ) s
      WHERE s.dist < $2;
    `

    const result = await this.identityRepository.query(query, [
      embeddingVector,
      this.similarityThreshold
    ])

    if (result && result.length > 0) {
      const matchData = result[0]
      const similarity = 1 - parseFloat(matchData.dist)

      console.log(`🔍 Found matching identity ${matchData.id} with similarity ${similarity.toFixed(3)} using pgvector`)

      // Преобразуем результат в объект Identity
      const bestMatch = this.identityRepository.create({
        id: matchData.id,
        images: matchData.images,
        attributes: matchData.attributes,
        status: matchData.status,
        createdAt: matchData.createdAt,
        updatedAt: matchData.updatedAt,
        profileId: matchData.profileId
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
    identity.status = 'unverified'
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
      },
      confidence: faceData.confidence
    }

    // Если есть данные изображения, сохраняем
    if (faceData.image_data) {
      identity.images = [faceData.image_data]
    } else {
      identity.images = []
    }

    const savedIdentity = await this.identityRepository.save(identity)

    // Сохраняем embedding отдельным запросом, так как TypeORM не поддерживает vector тип
    const embeddingVector = `[${faceData.embedding.join(',')}]`
    await this.identityRepository.query(
      'UPDATE itap.identities SET embedding = $1::vector WHERE id = $2',
      [embeddingVector, savedIdentity.id]
    )

    console.log(`✅ Created new identity: ${savedIdentity.id} with embedding vector`)

    return savedIdentity
  }

  /**
   * Обновить существующий Identity новым обнаружением
   */
  private async updateIdentityWithNewDetection(identity: Identity, faceData: FaceDetectionData): Promise<void> {
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
    identity.attributes.lastSeen = new Date().toISOString()
    identity.attributes.detectionCount = (identity.attributes.detectionCount || 0) + 1

    // Добавляем фото если есть (максимум 3)
    if (faceData.image_data) {
      if (!identity.images) identity.images = []
      identity.images.push(faceData.image_data)
      if (identity.images.length > 3) {
        identity.images = identity.images.slice(-3) // Оставляем последние 3
      }
    }

    await this.identityRepository.save(identity)

    // Обновляем embedding текущим значением
    const embeddingVector = `[${faceData.embedding.join(',')}]`
    await this.identityRepository.query(
      'UPDATE itap.identities SET embedding = $1::vector WHERE id = $2',
      [embeddingVector, identity.id]
    )
    console.log(`🔄 Updated identity ${identity.id}, total detections: ${identity.attributes.detectionCount}`)
  }


  /**
   * Получить все Identity с базовой информацией
   */
  async getAllIdentities(): Promise<Identity[]> {
    return await this.identityRepository.find({
      relations: ['profile'],
      order: { updatedAt: 'DESC' },
      take: 50 // Ограничиваем для производительности
    })
  }

  /**
   * Получить Identity по ID
   */
  async getIdentityById(id: string): Promise<Identity | null> {
    return await this.identityRepository.findOne({
      where: { id },
      relations: ['profile']
    })
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
    withProfile: number
  }> {
    const total = await this.identityRepository.count()
    const verified = await this.identityRepository.count({
      where: { status: 'verified' }
    })
    const unverified = await this.identityRepository.count({
      where: { status: 'unverified' }
    })

    // Подсчет identity с профилями
    const withProfileResult = await this.identityRepository.query(
      'SELECT COUNT(*) as count FROM itap.identities WHERE profile_id IS NOT NULL'
    )
    const withProfile = parseInt(withProfileResult[0]?.count || 0)

    return {
      total,
      verified,
      unverified,
      withProfile
    }
  }

  /**
   * Создать новую Identity с привязкой к профилю
   */
  async createIdentityForProfile(data: CreateIdentityData): Promise<Identity> {
    const identity = new Identity()
    identity.status = 'unverified'
    identity.attributes = {}
    identity.images = data.imageUrl ? [data.imageUrl] : []
    identity.profileId = data.profileId

    const savedIdentity = await this.identityRepository.save(identity)

    // Сохраняем embedding
    if (data.embedding && data.embedding.length > 0) {
      const embeddingVector = `[${data.embedding.join(',')}]`
      await this.identityRepository.query(
        'UPDATE itap.identities SET embedding = $1::vector WHERE id = $2',
        [embeddingVector, savedIdentity.id]
      )
    }

    return savedIdentity
  }

  /**
   * Привязать существующую Identity к профилю
   */
  async linkIdentityToProfile(identityId: string, profileId: string): Promise<Identity> {
    const identity = await this.identityRepository.findOne({ where: { id: identityId } })
    if (!identity) {
      throw new Error('Identity not found')
    }

    identity.profileId = profileId
    return await this.identityRepository.save(identity)
  }

  /**
   * Отвязать Identity от профиля
   */
  async unlinkIdentityFromProfile(identityId: string): Promise<Identity> {
    const identity = await this.identityRepository.findOne({ where: { id: identityId } })
    if (!identity) {
      throw new Error('Identity not found')
    }

    identity.profileId = undefined
    return await this.identityRepository.save(identity)
  }

  /**
   * Получить все Identity для профиля
   */
  async getIdentitiesByProfileId(profileId: string): Promise<Identity[]> {
    return await this.identityRepository.find({
      where: { profileId },
      order: { createdAt: 'DESC' }
    })
  }

  /**
   * Обновить статус Identity
   */
  async updateIdentityStatus(identityId: string, status: string): Promise<Identity> {
    const identity = await this.identityRepository.findOne({ where: { id: identityId } })
    if (!identity) {
      throw new Error('Identity not found')
    }

    identity.status = status
    return await this.identityRepository.save(identity)
  }

  /**
   * Удалить Identity
   */
  async deleteIdentity(identityId: string): Promise<void> {
    await this.identityRepository.delete(identityId)
  }

  /**
   * Сравнить несколько Identity по векторной схожести
   */
  async compareIdentities(identityIds: string[]): Promise<{
    baseIdentity: Identity
    comparisons: Array<{
      identity: Identity
      similarity: number
      distance: number
    }>
  }> {
    if (identityIds.length < 2) {
      throw new Error('At least 2 identities are required for comparison')
    }

    const baseIdentityId = identityIds[0]
    const compareIds = identityIds.slice(1)

    // Получаем базовую identity
    const baseIdentity = await this.identityRepository.findOne({
      where: { id: baseIdentityId },
      relations: ['profile']
    })

    if (!baseIdentity) {
      throw new Error('Base identity not found')
    }

    // Сравниваем с остальными
    const query = `
      SELECT
        i.id,
        i.status,
        i.created_at as "createdAt",
        i.updated_at as "updatedAt",
        i.images,
        i.attributes,
        i.profile_id as "profileId",
        (base.embedding <=> i.embedding) as distance,
        (1 - (base.embedding <=> i.embedding)) as similarity
      FROM itap.identities i
      CROSS JOIN (
        SELECT embedding
        FROM itap.identities
        WHERE id = $1 AND embedding IS NOT NULL
      ) base
      WHERE i.id = ANY($2::uuid[])
        AND i.embedding IS NOT NULL
      ORDER BY distance ASC
    `

    const results = await this.identityRepository.query(query, [
      baseIdentityId,
      compareIds
    ])

    const comparisons = await Promise.all(
      results.map(async (result: any) => {
        const identity = this.identityRepository.create({
          id: result.id,
          status: result.status,
          createdAt: result.createdAt,
          updatedAt: result.updatedAt,
          images: result.images,
          attributes: result.attributes,
          profileId: result.profileId
        })

        // Загружаем профиль если есть
        if (result.profileId) {
          identity.profile = await this.profileRepository.findOne({
            where: { id: result.profileId }
          })
        }

        return {
          identity,
          similarity: parseFloat(result.similarity),
          distance: parseFloat(result.distance)
        }
      })
    )

    return {
      baseIdentity,
      comparisons
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
      
      // Удаляем все записи через SQL для схемы itap
      await this.identityRepository.query('DELETE FROM itap.identities')
      
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