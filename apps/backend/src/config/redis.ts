import { createClient } from 'redis'

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'

export const redisClient = createClient({
  url: redisUrl,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 500)
  }
})

redisClient.on('error', (error) => {
  console.error('Redis client error:', error)
})

redisClient.on('connect', () => {
  console.log('Redis client connected')
})

redisClient.on('ready', () => {
  console.log('Redis client ready')
})

redisClient.on('end', () => {
  console.log('Redis client disconnected')
})

// Connect to Redis
redisClient.connect().catch(console.error)