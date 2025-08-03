import 'reflect-metadata'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'
import dotenv from 'dotenv'
import { createServer } from 'http'
import { Server } from 'socket.io'
import rateLimit from 'express-rate-limit'

import { AppDataSource } from './config/database.js'
import { redisClient } from './config/redis.js'
import { errorHandler } from './middleware/errorHandler.js'
import { authRoutes } from './routes/auth.js'
import { identityRoutes } from './routes/identities.js'
import { deviceRoutes } from './routes/devices.js'
import { facilityRoutes } from './routes/facilities.js'
import { analyticsRoutes } from './routes/analytics.js'
import faceRoutes from './routes/face.js'
import { faceService } from './services/realFaceService.js'

// Load environment variables
dotenv.config()

const app = express()
const server = createServer(app)
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
})

const PORT = process.env.PORT || 3001
const NODE_ENV = process.env.NODE_ENV || 'development'

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
})

// Middleware
app.use(helmet())
app.use(compression())
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  credentials: true
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(limiter)

// Logging
if (NODE_ENV === 'development') {
  app.use(morgan('dev'))
} else {
  app.use(morgan('combined'))
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: NODE_ENV
  })
})

// API Routes
app.use('/api/auth', authRoutes)
app.use('/api/identities', identityRoutes)
app.use('/api/devices', deviceRoutes)
app.use('/api/facilities', facilityRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/face', faceRoutes)

// Socket.io for real-time updates
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id)
  
  socket.on('join-facility', (facilityId: string) => {
    socket.join(`facility-${facilityId}`)
    console.log(`Client ${socket.id} joined facility ${facilityId}`)
  })
  
  socket.on('leave-facility', (facilityId: string) => {
    socket.leave(`facility-${facilityId}`)
    console.log(`Client ${socket.id} left facility ${facilityId}`)
  })
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id)
  })
})

// Error handling middleware (should be last)
app.use(errorHandler)

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`
  })
})

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database connection
    await AppDataSource.initialize()
    console.log('Database connection initialized successfully')
    
    // Test Redis connection
    await redisClient.ping()
    console.log('Redis connection established successfully')
    
    // Initialize face detection service
    try {
      await faceService.initialize()
      console.log('Face detection service initialized successfully')
    } catch (error) {
      console.warn('Face detection service initialization failed:', error.message)
      console.warn('Will use mock data for face detection')
    }
    
    // Start server
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`)
      console.log(`📍 Environment: ${NODE_ENV}`)
      console.log(`🔗 CORS enabled for: ${process.env.CORS_ORIGIN || "http://localhost:5173"}`)
    })
    
  } catch (error) {
    console.error('Error starting server:', error)
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully')
  server.close(() => {
    console.log('HTTP server closed')
  })
  
  try {
    await AppDataSource.destroy()
    await redisClient.quit()
    console.log('Database and Redis connections closed')
    process.exit(0)
  } catch (error) {
    console.error('Error during shutdown:', error)
    process.exit(1)
  }
})

startServer()

export { io }