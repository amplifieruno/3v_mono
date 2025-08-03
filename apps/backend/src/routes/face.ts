import { Router } from 'express'
import multer from 'multer'
import FormData from 'form-data'
import fetch from 'node-fetch'
import { faceService } from '../services/realFaceService.js'

const router = Router()

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Only image files are allowed'))
    }
  }
})

// CompreFace configuration
const COMPREFACE_API_URL = process.env.COMPREFACE_API_URL || 'http://localhost:8081'
const COMPREFACE_API_KEY = process.env.COMPREFACE_API_KEY || 'default-key'

/**
 * POST /api/face/detect
 * Detect faces in uploaded image using CompreFace
 */
router.post('/detect', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' })
    }

    console.log('Received image for detection:', {
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    })

    // Check if face service is ready
    if (!faceService.isReady()) {
      return res.status(503).json({ 
        error: 'Face detection service not initialized',
        details: 'TensorFlow.js or BlazeFace model not loaded'
      })
    }

    // Use real face detection service
    try {
      const result = await faceService.detectFaces(req.file.buffer)
      console.log(`Detected ${result.faces.length} faces in ${result.processing_time}ms`)
      res.json(result)
    } catch (error) {
      console.error('Face detection service error:', error)
      res.status(500).json({ 
        error: 'Face detection failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }

    // TODO: Uncomment when CompreFace API key is configured
    /*
    // Create form data for CompreFace
    const formData = new FormData()
    formData.append('file', req.file.buffer, {
      filename: 'image.jpg',
      contentType: req.file.mimetype,
    })

    // Send request to CompreFace
    const response = await fetch(`${COMPREFACE_API_URL}/api/v1/detection/detect`, {
      method: 'POST',
      headers: {
        'x-api-key': COMPREFACE_API_KEY,
        ...formData.getHeaders(),
      },
      body: formData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('CompreFace error:', errorText)
      return res.status(response.status).json({ 
        error: 'Face detection failed',
        details: errorText 
      })
    }

    const result = await response.json()
    
    // Transform the response to a more user-friendly format
    const transformedResult = {
      faces: result.result?.map((face: any) => ({
        confidence: face.box?.probability || 0,
        x_min: face.box?.x_min || 0,
        y_min: face.box?.y_min || 0,
        x_max: face.box?.x_max || 0,
        y_max: face.box?.y_max || 0,
        age: face.age?.low || null,
        gender: face.gender?.value || null,
        embedding: face.embedding || null,
      })) || [],
      processing_time: result.processing_time || 0,
    }

    res.json(transformedResult)
    */
  } catch (error) {
    console.error('Face detection error:', error)
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

/**
 * POST /api/face/recognize
 * Recognize faces in uploaded image against existing subjects
 */
router.post('/recognize', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' })
    }

    const formData = new FormData()
    formData.append('file', req.file.buffer, {
      filename: 'image.jpg',
      contentType: req.file.mimetype,
    })

    const response = await fetch(`${COMPREFACE_API_URL}/api/v1/recognition/recognize`, {
      method: 'POST',
      headers: {
        'x-api-key': COMPREFACE_API_KEY,
        ...formData.getHeaders(),
      },
      body: formData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('CompreFace recognition error:', errorText)
      return res.status(response.status).json({ 
        error: 'Face recognition failed',
        details: errorText 
      })
    }

    const result = await response.json()
    res.json(result)
  } catch (error) {
    console.error('Face recognition error:', error)
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

/**
 * GET /api/face/status
 * Check CompreFace service status
 */
router.get('/status', async (req, res) => {
  try {
    const response = await fetch(`${COMPREFACE_API_URL}/api/v1/status`)
    
    if (response.ok) {
      const status = await response.json()
      res.json({ 
        status: 'connected',
        compreface: status 
      })
    } else {
      res.status(503).json({ 
        status: 'disconnected',
        error: 'CompreFace service unavailable'
      })
    }
  } catch (error) {
    console.error('CompreFace status check failed:', error)
    res.status(503).json({ 
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

export default router