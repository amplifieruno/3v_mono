import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { profileService } from '../services/profileService.js'

const router: Router = Router()

// GET /api/profiles
router.get('/', asyncHandler(async (req, res) => {
  const { search } = req.query

  let profiles
  if (search) {
    profiles = await profileService.searchProfiles(search as string)
  } else {
    profiles = await profileService.getAllProfiles()
  }

  const stats = await profileService.getProfileStats()

  res.json({
    success: true,
    data: profiles,
    total: profiles.length,
    stats
  })
}))

// POST /api/profiles
router.post('/', asyncHandler(async (req, res) => {
  const { firstName, lastName, email } = req.body

  const newProfile = await profileService.createProfile({
    firstName,
    lastName,
    email
  })

  res.status(201).json({
    success: true,
    data: newProfile
  })
}))

// GET /api/profiles/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params

  const profile = await profileService.getProfileById(id)

  if (!profile) {
    return res.status(404).json({
      success: false,
      error: 'Profile not found'
    })
  }

  res.json({
    success: true,
    data: profile
  })
}))

// PUT /api/profiles/:id
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  const { firstName, lastName, email } = req.body

  const updatedProfile = await profileService.updateProfile(id, {
    firstName,
    lastName,
    email
  })

  res.json({
    success: true,
    data: updatedProfile
  })
}))

// DELETE /api/profiles/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params

  const profile = await profileService.getProfileById(id)
  if (!profile) {
    return res.status(404).json({
      success: false,
      error: 'Profile not found'
    })
  }

  await profileService.deleteProfile(id)

  res.json({
    success: true,
    message: `Profile ${id} deleted successfully`
  })
}))

// POST /api/profiles/clear - Очистить всю базу Profile (ОПАСНАЯ ОПЕРАЦИЯ!)
router.post('/clear', asyncHandler(async (req, res) => {
  console.log('⚠️  CLEAR ALL PROFILES REQUEST from client')

  try {
    const result = await profileService.clearAllProfiles()

    res.json({
      success: true,
      data: result,
      message: result.message
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Ошибка при очистке базы данных',
      message: 'Не удалось очистить базу данных Profile'
    })
  }
}))

export { router as profileRoutes }