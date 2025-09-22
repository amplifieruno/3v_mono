import { Repository } from 'typeorm'
import { AppDataSource } from '../config/database.js'
import { Profile } from '../entities/Profile.js'
import { identityService } from './identityService.js'

interface CreateProfileData {
  firstName?: string
  lastName?: string
  email?: string
}

interface UpdateProfileData {
  firstName?: string
  lastName?: string
  email?: string
}

export class ProfileService {
  private profileRepository: Repository<Profile>

  constructor() {
    this.profileRepository = AppDataSource.getRepository(Profile)
  }

  /**
   * Создать новый профиль
   */
  async createProfile(data: CreateProfileData): Promise<Profile> {
    const profile = new Profile()
    profile.firstName = data.firstName
    profile.lastName = data.lastName
    profile.email = data.email

    return await this.profileRepository.save(profile)
  }

  /**
   * Получить все профили
   */
  async getAllProfiles(): Promise<Profile[]> {
    return await this.profileRepository.find({
      relations: ['identities'],
      order: { updatedAt: 'DESC' },
      take: 100
    })
  }

  /**
   * Получить профиль по ID
   */
  async getProfileById(id: string): Promise<Profile | null> {
    return await this.profileRepository.findOne({
      where: { id },
      relations: ['identities']
    })
  }

  /**
   * Обновить профиль
   */
  async updateProfile(id: string, data: UpdateProfileData): Promise<Profile> {
    const profile = await this.profileRepository.findOne({ where: { id } })
    if (!profile) {
      throw new Error('Profile not found')
    }

    if (data.firstName !== undefined) profile.firstName = data.firstName
    if (data.lastName !== undefined) profile.lastName = data.lastName
    if (data.email !== undefined) profile.email = data.email

    return await this.profileRepository.save(profile)
  }

  /**
   * Удалить профиль
   */
  async deleteProfile(id: string): Promise<void> {
    // Сначала отвязываем все identities от профиля
    const identities = await identityService.getIdentitiesByProfileId(id)
    for (const identity of identities) {
      await identityService.unlinkIdentityFromProfile(identity.id)
    }

    // Удаляем профиль
    await this.profileRepository.delete(id)
  }

  /**
   * Получить статистику по профилям
   */
  async getProfileStats(): Promise<{
    total: number
    withIdentities: number
    withoutIdentities: number
  }> {
    const total = await this.profileRepository.count()

    const withIdentitiesResult = await this.profileRepository.query(`
      SELECT COUNT(DISTINCT p.id) as count
      FROM itap.profiles p
      INNER JOIN itap.identities i ON i.profile_id = p.id
    `)
    const withIdentities = parseInt(withIdentitiesResult[0]?.count || 0)

    const withoutIdentities = total - withIdentities

    return {
      total,
      withIdentities,
      withoutIdentities
    }
  }

  /**
   * Поиск профилей по имени или email
   */
  async searchProfiles(query: string): Promise<Profile[]> {
    const searchQuery = `%${query}%`

    return await this.profileRepository
      .createQueryBuilder('profile')
      .leftJoinAndSelect('profile.identities', 'identities')
      .where('profile.first_name ILIKE :query', { query: searchQuery })
      .orWhere('profile.last_name ILIKE :query', { query: searchQuery })
      .orWhere('profile.email ILIKE :query', { query: searchQuery })
      .orderBy('profile.updated_at', 'DESC')
      .take(50)
      .getMany()
  }

  /**
   * Очистить всю базу профилей (ОПАСНАЯ ОПЕРАЦИЯ!)
   */
  async clearAllProfiles(): Promise<{ deleted: number, message: string }> {
    console.log('🗑️ CLEARING ALL PROFILES FROM DATABASE (DANGEROUS OPERATION)')

    try {
      const totalCount = await this.profileRepository.count()

      if (totalCount === 0) {
        return {
          deleted: 0,
          message: 'База Profile уже пуста'
        }
      }

      // Сначала отвязываем все identities
      await this.profileRepository.query('UPDATE itap.identities SET profile_id = NULL')

      // Удаляем все профили
      await this.profileRepository.query('DELETE FROM itap.profiles')

      console.log(`✅ Successfully cleared ${totalCount} profiles from database`)

      return {
        deleted: totalCount,
        message: `Успешно удалено ${totalCount} Profile записей из базы данных`
      }

    } catch (error) {
      console.error('❌ Error clearing profiles:', error)
      throw new Error(`Ошибка при очистке базы данных: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`)
    }
  }
}

// Экспортируем singleton instance
export const profileService = new ProfileService()