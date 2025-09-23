import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'

const router: Router = Router()

// Demo credentials
const DEMO_CREDENTIALS = {
  email: 'admin@tulkumurun.kg',
  password: 'QnGmiNE$@v@Y'
}

// Demo user data
const DEMO_USER = {
  id: 'demo-user-001',
  email: 'admin@tulkumurun.kg',
  firstName: 'Admin',
  lastName: 'User',
  role: 'admin',
  permissions: ['read', 'write', 'delete', 'admin']
}

// Demo JWT token (fake)
const DEMO_TOKEN = 'demo-jwt-token-' + Date.now()

// POST /api/auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password are required'
    })
  }

  // Check demo credentials
  if (email !== DEMO_CREDENTIALS.email || password !== DEMO_CREDENTIALS.password) {
    return res.status(401).json({
      success: false,
      error: 'Invalid credentials'
    })
  }

  // Return demo user and token
  res.json({
    success: true,
    data: {
      user: DEMO_USER,
      token: DEMO_TOKEN,
      expiresIn: 86400 // 24 hours
    }
  })
}))

// POST /api/auth/logout
router.post('/logout', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully'
  })
}))

// GET /api/auth/me - Get current user info
router.get('/me', asyncHandler(async (req, res) => {
  // In a real app, we would verify the JWT token here
  const authHeader = req.headers.authorization
  const token = authHeader?.replace('Bearer ', '')

  if (!token || !token.startsWith('demo-jwt-token-')) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or missing token'
    })
  }

  res.json({
    success: true,
    data: {
      user: DEMO_USER
    }
  })
}))

export { router as authRoutes }