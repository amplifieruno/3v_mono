import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'

const router = Router()

// GET /api/devices
router.get('/', asyncHandler(async (req, res) => {
  // TODO: Implement actual device fetching
  const devices = [
    {
      id: '1',
      name: 'Main Entrance Camera',
      deviceType: 'static_video_camera',
      areaId: 'area-1',
      streamUrl: 'rtsp://example.com/stream1',
      status: 'active',
      healthStatus: 'healthy',
      lastSeen: new Date()
    }
  ]
  
  res.json({
    success: true,
    data: devices,
    total: devices.length
  })
}))

// POST /api/devices
router.post('/', asyncHandler(async (req, res) => {
  // TODO: Implement device registration
  const newDevice = {
    id: '2',
    ...req.body,
    createdAt: new Date(),
    status: 'active'
  }
  
  res.status(201).json({
    success: true,
    data: newDevice
  })
}))

export { router as deviceRoutes }