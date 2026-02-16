import { Router, Request, Response } from 'express'
import fetch from 'node-fetch'
import { recognitionManager } from '../services/recognitionManager.js'

const router: Router = Router()

const HASURA_GRAPHQL_URL = process.env.HASURA_GRAPHQL_URL || 'http://localhost:8080/v1/graphql'
const HASURA_ADMIN_SECRET = process.env.GRAPHQL_ADMIN_SECRET || process.env.HASURA_ADMIN_SECRET || 'change-me'

async function updateDeviceRecognition(deviceId: string, enabled: boolean): Promise<void> {
  const mutation = `
    mutation UpdateDeviceRecognition($id: uuid!, $enabled: Boolean!) {
      update_itap_devices_by_pk(pk_columns: { id: $id }, _set: { recognition_enabled: $enabled }) { id }
    }
  `
  const response = await fetch(HASURA_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': HASURA_ADMIN_SECRET,
    },
    body: JSON.stringify({ query: mutation, variables: { id: deviceId, enabled } }),
  })
  const result = (await response.json()) as { errors?: unknown[] }
  if (result.errors) {
    throw new Error(`Hasura error: ${JSON.stringify(result.errors)}`)
  }
}

// GET /api/recognition/status — all active sessions
router.get('/status', (_req: Request, res: Response) => {
  const sessions = recognitionManager.getStatus()
  res.json({ sessions, total: sessions.length })
})

// GET /api/recognition/status/:deviceId — single device session
router.get('/status/:deviceId', (req: Request, res: Response) => {
  const session = recognitionManager.getSession(req.params.deviceId)
  if (!session) {
    return res.json({ isRunning: false })
  }
  res.json(session.getStatus())
})

// POST /api/recognition/start/:deviceId — force-start recognition
router.post('/start/:deviceId', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params
    const device = await recognitionManager.getDevice(deviceId)
    if (!device) {
      return res.status(404).json({ error: 'Device not found' })
    }
    if (!device.stream_url) {
      return res.status(400).json({ error: 'Device has no stream URL' })
    }

    await updateDeviceRecognition(deviceId, true)
    await recognitionManager.startSession(device)
    res.json({ message: 'Recognition started', deviceId })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: 'Failed to start recognition', message: msg })
  }
})

// POST /api/recognition/stop/:deviceId — force-stop recognition
router.post('/stop/:deviceId', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params
    await updateDeviceRecognition(deviceId, false)
    await recognitionManager.stopSession(deviceId)
    res.json({ message: 'Recognition stopped', deviceId })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: 'Failed to stop recognition', message: msg })
  }
})

export default router
