import fetch from 'node-fetch'
import { Server } from 'socket.io'
import { insightFaceService } from './insightFaceService.js'

// Config
const HASURA_GRAPHQL_URL = process.env.HASURA_GRAPHQL_URL || 'http://localhost:8080/v1/graphql'
const HASURA_ADMIN_SECRET = process.env.GRAPHQL_ADMIN_SECRET || process.env.HASURA_ADMIN_SECRET || 'change-me'
const STREAM_SERVER_URL = process.env.STREAM_SERVER_URL || 'http://localhost:8888'
const POLL_INTERVAL_MS = 10_000
const STATUS_EMIT_INTERVAL_MS = 5_000

// Types
interface DeviceInfo {
  id: string
  name: string
  stream_url: string
  recognition_fps: number
}

interface SessionStats {
  framesProcessed: number
  facesDetected: number
  identitiesCreated: number
  errors: number
  startedAt: string
}

export interface SessionStatus {
  deviceId: string
  deviceName: string
  isRunning: boolean
  stats: SessionStats
}

interface DetectionInput {
  device_id: string
  identity_id: string
  confidence: number
  similarity: number
  is_new_identity: boolean
  bbox: Record<string, number>
  thumbnail: string | null
}

// Helper: extract stream ID from a stream URL (e.g. "rtsp://host:8554/entrance" -> "entrance")
function extractStreamId(streamUrl: string): string {
  try {
    const url = new URL(streamUrl)
    return url.pathname.replace(/^\//, '')
  } catch {
    const match = streamUrl.match(/\/([^/]+)$/)
    return match?.[1] ?? streamUrl
  }
}

// Hasura GraphQL helper
async function hasuraQuery<T = unknown>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(HASURA_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': HASURA_ADMIN_SECRET,
    },
    body: JSON.stringify({ query, variables }),
  })
  const result = (await response.json()) as { data?: T; errors?: unknown[] }
  if (result.errors) {
    throw new Error(`Hasura error: ${JSON.stringify(result.errors)}`)
  }
  return result.data as T
}

// Log detection to Hasura
async function logDetection(data: DetectionInput): Promise<{ id: string }> {
  const mutation = `
    mutation InsertDetection($object: itap_detections_insert_input!) {
      insert_itap_detections_one(object: $object) { id }
    }
  `
  const result = await hasuraQuery<{ insert_itap_detections_one: { id: string } }>(mutation, { object: data })
  return result.insert_itap_detections_one
}

class RecognitionSession {
  private fetchInterval: NodeJS.Timeout | null = null
  private isProcessing = false
  private _isRunning = false
  private statusInterval: NodeJS.Timeout | null = null
  private snapshotUrl: string
  readonly stats: SessionStats

  constructor(
    readonly deviceId: string,
    readonly deviceName: string,
    private streamUrl: string,
    private fps: number,
    private io: Server | null,
  ) {
    const streamId = extractStreamId(streamUrl)
    this.snapshotUrl = `${STREAM_SERVER_URL}/streams/${streamId}/snapshot.jpg`
    this.stats = {
      framesProcessed: 0,
      facesDetected: 0,
      identitiesCreated: 0,
      errors: 0,
      startedAt: new Date().toISOString(),
    }
  }

  get isRunning(): boolean {
    return this._isRunning
  }

  start(): void {
    if (this._isRunning) return

    // Clear any stale intervals from a previous run
    if (this.statusInterval) {
      clearInterval(this.statusInterval)
      this.statusInterval = null
    }
    if (this.fetchInterval) {
      clearInterval(this.fetchInterval)
      this.fetchInterval = null
    }

    this._isRunning = true

    const intervalMs = Math.max(1000 / this.fps, 500) // Min 500ms between frames

    console.log(`[Recognition] Starting snapshot polling for ${this.deviceName} (${this.deviceId})`)
    console.log(`[Recognition] URL: ${this.snapshotUrl}, interval: ${intervalMs}ms`)

    // Fetch frames on interval
    this.fetchInterval = setInterval(() => this.fetchSnapshot(), intervalMs)

    // Emit status every 5 seconds
    this.statusInterval = setInterval(() => {
      this.io?.to(`device:${this.deviceId}`).emit('recognition:status', {
        device_id: this.deviceId,
        isRunning: this._isRunning,
        stats: this.stats,
      })
    }, STATUS_EMIT_INTERVAL_MS)

    this.io?.to(`device:${this.deviceId}`).emit('recognition:started', {
      device_id: this.deviceId,
    })
  }

  stop(): void {
    this._isRunning = false

    if (this.fetchInterval) {
      clearInterval(this.fetchInterval)
      this.fetchInterval = null
    }
    if (this.statusInterval) {
      clearInterval(this.statusInterval)
      this.statusInterval = null
    }

    this.io?.to(`device:${this.deviceId}`).emit('recognition:stopped', {
      device_id: this.deviceId,
    })
    console.log(`[Recognition] Stopped session for ${this.deviceName} (${this.deviceId})`)
  }

  getStatus(): SessionStatus {
    return {
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      isRunning: this._isRunning,
      stats: { ...this.stats },
    }
  }

  private async fetchSnapshot(): Promise<void> {
    if (this.isProcessing || !this._isRunning) return

    try {
      const response = await fetch(this.snapshotUrl)
      if (!response.ok) {
        throw new Error(`Snapshot HTTP ${response.status}`)
      }
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      await this.processFrame(buffer)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (!msg.startsWith('Frame dropped')) {
        this.stats.errors++
        console.error(`[Recognition] Snapshot error for ${this.deviceId}: ${msg}`)
      }
    }
  }

  private async processFrame(frameBuffer: Buffer): Promise<void> {
    if (this.isProcessing) return
    this.isProcessing = true

    try {
      if (!insightFaceService.isReady()) {
        this.stats.errors++
        return
      }

      // detectFaces also handles identity matching internally
      const result = await insightFaceService.detectFaces(frameBuffer)

      for (const face of result.faces) {
        if (!face.identity) continue

        const detection = await logDetection({
          device_id: this.deviceId,
          identity_id: face.identity.id,
          confidence: face.confidence,
          similarity: face.identity.similarity,
          is_new_identity: face.identity.isNewIdentity,
          bbox: { x_min: face.x_min, y_min: face.y_min, x_max: face.x_max, y_max: face.y_max },
          thumbnail: null,
        })

        this.io?.to(`device:${this.deviceId}`).emit('detection', {
          id: detection.id,
          device_id: this.deviceId,
          identity_id: face.identity.id,
          confidence: face.confidence,
          similarity: face.identity.similarity,
          is_new_identity: face.identity.isNewIdentity,
          thumbnail: null,
          timestamp: new Date().toISOString(),
          identity: {
            id: face.identity.id,
            status: face.identity.status,
            detectionCount: face.identity.detectionCount,
          },
        })

        this.stats.facesDetected++
        if (face.identity.isNewIdentity) this.stats.identitiesCreated++
      }

      this.stats.framesProcessed++
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      // "Frame dropped" errors are expected backpressure — not real errors
      if (!msg.startsWith('Frame dropped')) {
        this.stats.errors++
        console.error(`[Recognition] Process error for ${this.deviceId}: ${msg}`)
      }
    } finally {
      this.isProcessing = false
    }
  }
}

class RecognitionManager {
  private sessions = new Map<string, RecognitionSession>()
  private io: Server | null = null
  private pollInterval: NodeJS.Timeout | null = null

  setIo(io: Server): void {
    this.io = io
  }

  async initialize(): Promise<void> {
    try {
      const devices = await this.getActiveDevices()
      for (const device of devices) {
        if (device.stream_url) {
          await this.startSession(device)
        }
      }
      console.log(`[Recognition] Initialized with ${this.sessions.size} active sessions`)

      this.pollInterval = setInterval(() => this.pollForChanges(), POLL_INTERVAL_MS)
    } catch (error) {
      console.error('[Recognition] Init failed:', error)
    }
  }

  async startSession(device: DeviceInfo): Promise<void> {
    if (this.sessions.has(device.id)) {
      console.log(`[Recognition] Session already exists for ${device.id}`)
      return
    }

    const session = new RecognitionSession(
      device.id,
      device.name,
      device.stream_url,
      device.recognition_fps || 1,
      this.io,
    )
    this.sessions.set(device.id, session)
    session.start()
  }

  async stopSession(deviceId: string): Promise<void> {
    const session = this.sessions.get(deviceId)
    if (session) {
      session.stop()
      this.sessions.delete(deviceId)
    }
  }

  getStatus(): SessionStatus[] {
    return Array.from(this.sessions.values()).map((s) => s.getStatus())
  }

  getSession(deviceId: string): RecognitionSession | undefined {
    return this.sessions.get(deviceId)
  }

  async getDevice(deviceId: string): Promise<DeviceInfo | null> {
    const query = `
      query GetDevice($id: uuid!) {
        itap_devices_by_pk(id: $id) { id name stream_url recognition_fps }
      }
    `
    const data = await hasuraQuery<{ itap_devices_by_pk: DeviceInfo | null }>(query, { id: deviceId })
    return data.itap_devices_by_pk
  }

  async shutdown(): Promise<void> {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
    const ids = Array.from(this.sessions.keys())
    for (const id of ids) {
      await this.stopSession(id)
    }
    console.log('[Recognition] All sessions stopped')
  }

  private async getActiveDevices(): Promise<DeviceInfo[]> {
    const query = `
      query GetActiveDevices {
        itap_devices(where: { recognition_enabled: { _eq: true } }) {
          id name stream_url recognition_fps
        }
      }
    `
    const data = await hasuraQuery<{ itap_devices: DeviceInfo[] }>(query)
    return data.itap_devices || []
  }

  private async pollForChanges(): Promise<void> {
    try {
      const activeDevices = await this.getActiveDevices()
      const activeIds = new Set(activeDevices.map((d) => d.id))

      // Start new sessions
      for (const device of activeDevices) {
        if (!this.sessions.has(device.id) && device.stream_url) {
          await this.startSession(device)
        }
      }

      // Stop sessions for devices no longer active
      for (const [deviceId] of this.sessions) {
        if (!activeIds.has(deviceId)) {
          await this.stopSession(deviceId)
        }
      }
    } catch (error) {
      console.error('[Recognition] Poll error:', error instanceof Error ? error.message : error)
    }
  }
}

export const recognitionManager = new RecognitionManager()
