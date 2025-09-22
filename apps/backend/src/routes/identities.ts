import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { identityService } from '../services/identityService.js'

const router: Router = Router()

// GET /api/identities
router.get('/', asyncHandler(async (req, res) => {
  const identities = await identityService.getAllIdentities()
  const stats = await identityService.getIdentityStats()

  res.json({
    success: true,
    data: identities.map(identity => ({
      id: identity.id,
      status: identity.status,
      createdAt: identity.createdAt,
      updatedAt: identity.updatedAt,
      attributes: identity.attributes,
      images: identity.images,
      profileId: identity.profileId,
      profile: identity.profile,
      hasImages: identity.images && identity.images.length > 0,
      imageCount: identity.images?.length || 0
    })),
    total: identities.length,
    stats
  })
}))

// POST /api/identities
router.post('/', asyncHandler(async (req, res) => {
  const { embedding, imageUrl, profileId } = req.body

  const newIdentity = await identityService.createIdentityForProfile({
    embedding,
    imageUrl,
    profileId
  })

  res.status(201).json({
    success: true,
    data: newIdentity
  })
}))

// GET /api/identities/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params

  const identity = await identityService.getIdentityById(id)

  if (!identity) {
    return res.status(404).json({
      success: false,
      error: 'Identity not found'
    })
  }

  res.json({
    success: true,
    data: {
      id: identity.id,
      status: identity.status,
      createdAt: identity.createdAt,
      updatedAt: identity.updatedAt,
      attributes: identity.attributes,
      images: identity.images,
      profileId: identity.profileId,
      profile: identity.profile
    }
  })
}))

// PUT /api/identities/:id
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  const { status, profileId } = req.body

  let identity = await identityService.getIdentityById(id)

  if (!identity) {
    return res.status(404).json({
      success: false,
      error: 'Identity not found'
    })
  }

  if (status) {
    identity = await identityService.updateIdentityStatus(id, status)
  }

  if (profileId !== undefined) {
    if (profileId === null) {
      identity = await identityService.unlinkIdentityFromProfile(id)
    } else {
      identity = await identityService.linkIdentityToProfile(id, profileId)
    }
  }

  res.json({
    success: true,
    data: identity
  })
}))

// DELETE /api/identities/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params

  const identity = await identityService.getIdentityById(id)
  if (!identity) {
    return res.status(404).json({
      success: false,
      error: 'Identity not found'
    })
  }

  await identityService.deleteIdentity(id)

  res.json({
    success: true,
    message: `Identity ${id} deleted successfully`
  })
}))

// GET /api/identities/profile/:profileId
router.get('/profile/:profileId', asyncHandler(async (req, res) => {
  const { profileId } = req.params
  const identities = await identityService.getIdentitiesByProfileId(profileId)

  res.json({
    success: true,
    data: identities,
    total: identities.length
  })
}))

// POST /api/identities/clear - Очистить всю базу Identity (ОПАСНАЯ ОПЕРАЦИЯ!)
router.post('/clear', asyncHandler(async (req, res) => {
  console.log('⚠️  CLEAR ALL IDENTITIES REQUEST from client')
  
  try {
    const result = await identityService.clearAllIdentities()
    
    res.json({
      success: true,
      data: result,
      message: result.message
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Ошибка при очистке базы данных',
      message: 'Не удалось очистить базу данных Identity'
    })
  }
}))

export { router as identityRoutes }