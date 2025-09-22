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
      confidence: identity.confidence,
      status: identity.status,
      detectionCount: identity.detectionCount,
      firstSeen: identity.firstSeen,
      lastSeen: identity.lastSeen,
      createdAt: identity.createdAt,
      updatedAt: identity.updatedAt,
      attributes: identity.attributes,
      hasPhotos: identity.photos && identity.photos.length > 0,
      photoCount: identity.photos?.length || 0,
      photos: identity.photos || [], // Включаем фотографии в ответ
      embeddingCount: identity.embeddings?.length || 0
    })),
    total: identities.length,
    stats
  })
}))

// POST /api/identities
router.post('/', asyncHandler(async (req, res) => {
  // TODO: Implement identity creation
  const newIdentity = {
    id: '2',
    ...req.body,
    createdAt: new Date()
  }
  
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
      confidence: identity.confidence,
      status: identity.status,
      detectionCount: identity.detectionCount,
      firstSeen: identity.firstSeen,
      lastSeen: identity.lastSeen,
      createdAt: identity.createdAt,
      updatedAt: identity.updatedAt,
      attributes: identity.attributes,
      photos: identity.photos,
      embeddingCount: identity.embeddings?.length || 0
    }
  })
}))

// PUT /api/identities/:id
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  
  // TODO: Implement identity update
  const updatedIdentity = {
    id,
    ...req.body,
    updatedAt: new Date()
  }
  
  res.json({
    success: true,
    data: updatedIdentity
  })
}))

// DELETE /api/identities/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  
  // TODO: Implement identity deletion
  res.json({
    success: true,
    message: `Identity ${id} deleted successfully`
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