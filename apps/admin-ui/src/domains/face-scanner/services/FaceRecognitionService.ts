/**
 * Face Recognition Service
 *
 * Core face scanning service using @vladmandic/human library.
 * Handles multi-angle face capture (center, top, right, bottom, left)
 * with head rotation tracking and position validation.
 *
 * Migrated from temp/oneboard-widget with adaptations for new domain structure.
 */

import { Human, Config as HumanConfig, FaceResult } from '@vladmandic/human'

import Listener from './Listener'
import type { FaceBox, BoxInset, Position, ScanStatus, ScanPosition } from '../types'

export type Options = {
  container: HTMLElement
  minFaceHeight: number
  startFaceBox: BoxInset
  exitFaceBox: BoxInset
  positions: {
    [position: string]: Position
  }
  startPosition: string
  startDelayMs: number
  debug?: boolean
}

const mainAxis = 0.3
const secondAxis = 0.3

export class FaceRecognitionService extends Listener {
  dom: {
    container: HTMLElement
    video: HTMLVideoElement
    canvas: HTMLCanvasElement
    faceBox?: HTMLElement
    startBox?: HTMLElement
    exitBox?: HTMLElement
  }

  config: Partial<HumanConfig> = {
    async: true,
    modelBasePath: '/models', // Models in public directory
    filter: { enabled: true, equalization: false, flip: false },

    face: {
      enabled: true,
      detector: { rotation: true },
      mesh: { enabled: true },
      attention: { enabled: false },
      iris: { enabled: false },
      description: { enabled: false },
      emotion: { enabled: false },
    },
    body: { enabled: false },
    hand: { enabled: false },
    object: { enabled: false },
    gesture: { enabled: false },
  }

  options: Partial<Options> = {
    minFaceHeight: 0.3,
    startFaceBox: [0.1, 0.1, 0.1, 0.1],
    exitFaceBox: [0.05, 0.05, 0.05, 0.05],
    positions: {
      center: {
        yawMin: -secondAxis,
        yawMax: secondAxis,
        pitchMin: -secondAxis,
        pitchMax: secondAxis,
      },
      top: {
        yawMin: -secondAxis,
        yawMax: secondAxis,
        pitchMax: -mainAxis,
      },
      right: {
        yawMin: mainAxis,
        pitchMin: -secondAxis,
        pitchMax: secondAxis,
      },
      bottom: {
        yawMin: -secondAxis,
        yawMax: secondAxis,
        pitchMin: mainAxis,
      },
      left: {
        yawMax: -mainAxis,
        pitchMin: -secondAxis,
        pitchMax: secondAxis,
      },
    },
    startPosition: 'center',
    startDelayMs: 1000,
  }

  screenshots: {
    [position: string]: string
  } = {}

  human?: Human

  status?: ScanStatus

  startHoldingTime: number | null = null

  stream?: MediaStream

  drawTimeoutId?: number

  detectAnimationRequestId?: number

  destroyed = false

  constructor(options: Partial<Options>) {
    super()
    this.options = {
      ...this.options,
      ...options,
    }

    if (options.container) {
      options.container.innerHTML = ''

      const video = document.createElement('video')
      video.style.display = 'none'
      video.setAttribute('playsinline', '')
      options.container.appendChild(video)

      const canvas = document.createElement('canvas')
      canvas.style.width = '100%'
      options.container.appendChild(canvas)

      this.dom = {
        container: options.container,
        video,
        canvas,
      }

      if (this.options.debug) {
        this.dom.faceBox = document.createElement('div')
        this.dom.faceBox.style.border = '1px dashed #f55'
        this.dom.faceBox.style.position = 'absolute'
        options.container.appendChild(this.dom.faceBox)

        if (this.options.startFaceBox) {
          this.dom.startBox = document.createElement('div')
          this.dom.startBox.style.border = '1px solid #5f5'
          this.dom.startBox.style.position = 'absolute'
          this.dom.startBox.style.top = `${this.options.startFaceBox[0] * 100}%`
          this.dom.startBox.style.right = `${this.options.startFaceBox[1] * 100}%`
          this.dom.startBox.style.bottom = `${this.options.startFaceBox[2] * 100}%`
          this.dom.startBox.style.left = `${this.options.startFaceBox[3] * 100}%`
          options.container.appendChild(this.dom.startBox)
        }

        if (this.options.exitFaceBox) {
          this.dom.exitBox = document.createElement('div')
          this.dom.exitBox.style.border = '1px solid #55f'
          this.dom.exitBox.style.position = 'absolute'
          this.dom.exitBox.style.top = `${this.options.exitFaceBox[0] * 100}%`
          this.dom.exitBox.style.right = `${this.options.exitFaceBox[1] * 100}%`
          this.dom.exitBox.style.bottom = `${this.options.exitFaceBox[2] * 100}%`
          this.dom.exitBox.style.left = `${this.options.exitFaceBox[3] * 100}%`
          options.container.appendChild(this.dom.exitBox)
        }
      }
    } else {
      throw new Error('container is not provided')
    }
  }

  private initialize = async () => {
    this.human = new Human(this.config)
  }

  private reset() {
    this.screenshots = {}
    this.trigger('reset')
    this.setStatus('reseted')
  }

  private setStatus(status: ScanStatus) {
    const changed = this.status !== status
    this.status = status
    if (changed) {
      this.trigger('status', status)
    }
  }

  private getFaceBox(face: FaceResult): FaceBox {
    // Calculate face box from mesh landmarks
    // Using main facial points for accurate bounding
    let left = face.meshRaw[247][0]
    let top = face.meshRaw[168][1]
    let right = face.meshRaw[359][0]
    let bottom = face.meshRaw[0][1]

    const minWidth = right - left
    const minHeight = bottom - top
    const width = minWidth * 1.3
    const height = minHeight * 2
    const difWidth = (width - minWidth) / 2
    const difHeight = (height - minHeight) / 2

    left = left - difWidth
    right = 1 - right - difWidth
    top = top - difHeight * 1.3
    bottom = 1 - bottom - difHeight * 0.7

    return {
      left,
      top,
      right,
      bottom,
      width,
      height,
    }
  }

  private isFaceBoxInInsetBox(faceBox: FaceBox, insetBox: BoxInset): boolean {
    if (
      faceBox.top < insetBox[0] ||
      faceBox.right < insetBox[1] ||
      faceBox.bottom < insetBox[2] ||
      faceBox.left < insetBox[3]
    ) {
      return false
    }
    return true
  }

  private isFaceInPosition(face: FaceResult, position: Position): boolean {
    if (face.rotation?.angle) {
      const { yaw, pitch } = face.rotation.angle
      if (
        (position.pitchMax === undefined || pitch <= position.pitchMax) &&
        (position.pitchMin === undefined || pitch >= position.pitchMin) &&
        (position.yawMax === undefined || yaw <= position.yawMax) &&
        (position.yawMin === undefined || yaw >= position.yawMin)
      ) {
        return true
      }
    }
    return false
  }

  start = async () => {
    await this.initialize()
    if (!this.human) {
      this.setStatus('failed')
      return
    }
    await this.human.load()
    this.setStatus('initializing')
    await this.human.warmup()
    await this.startWebcam()
    await this.detectionLoop()
    await this.drawLoop()
  }

  startWebcam = async () => {
    this.setStatus('starting')

    const options = {
      audio: false,
      video: {
        facingMode: 'user',
        // @ts-ignore resizeMode is not yet defined in tslib
        resizeMode: 'none',
        width: { ideal: document.body.clientWidth },
        height: { ideal: document.body.clientHeight },
      },
    }
    this.stream = await navigator.mediaDevices.getUserMedia(options)
    const ready = new Promise((resolve) => {
      this.dom.video.onloadeddata = () => resolve(true)
    })
    this.dom.video.srcObject = this.stream
    this.dom.video.play()
    await ready
    this.dom.canvas.width = this.dom.video.videoWidth
    this.dom.canvas.height = this.dom.video.videoHeight
    this.setStatus('searchFace')
  }

  drawLoop = async () => {
    if (!this.dom.video.paused && this.human) {
      const interpolated = await this.human.next(this.human.result)
      await this.human.draw.canvas(this.dom.video, this.dom.canvas)

      if (this.options.debug) {
        await this.human.draw.face(this.dom.canvas, interpolated.face, {
          drawBoxes: false,
          drawAttention: false,
          drawGestures: false,
          drawLabels: false,
          drawPoints: false,
        })
      }

      this.checkFace(interpolated.face)
    }
    this.drawTimeoutId = window.setTimeout(this.drawLoop, 30)
  }

  detectionLoop = async () => {
    if (!this.dom.video.paused && this.human) {
      await this.human.detect(this.dom.video)
    }
    this.detectAnimationRequestId = requestAnimationFrame(this.detectionLoop)
  }

  checkFace = (face: FaceResult[]) => {
    if (face.length === 1) {
      const faceBox = this.getFaceBox(face[0])
      const {
        startFaceBox,
        exitFaceBox = startFaceBox,
        positions,
        startDelayMs = 0,
        startPosition,
      } = this.options

      if (this.options.debug && this.dom.faceBox) {
        this.dom.faceBox.style.top = `${faceBox.top * 100}%`
        this.dom.faceBox.style.bottom = `${faceBox.bottom * 100}%`
        if (this.config.filter?.flip) {
          this.dom.faceBox.style.right = `${faceBox.left * 100}%`
          this.dom.faceBox.style.left = `${faceBox.right * 100}%`
        } else {
          this.dom.faceBox.style.right = `${faceBox.right * 100}%`
          this.dom.faceBox.style.left = `${faceBox.left * 100}%`
        }
      }

      if (!startPosition || !positions) {
        return
      }

      if (this.status === 'searchFace' || this.status === 'reseted') {
        this.setStatus('startingFace')
      } else if (this.status === 'startingFace') {
        if (startFaceBox && this.isFaceBoxInInsetBox(faceBox, startFaceBox)) {
          this.startHoldingTime = Date.now()
          this.setStatus('holdingFace')
        }
      } else if (this.status === 'holdingFace') {
        if (
          this.startHoldingTime &&
          startFaceBox &&
          this.isFaceBoxInInsetBox(faceBox, startFaceBox)
        ) {
          if (Date.now() - this.startHoldingTime > startDelayMs) {
            const position = positions[startPosition]
            if (this.isFaceInPosition(face[0], position)) {
              this.takeScreenshot(startPosition)
              this.setStatus('trackFacePositions')
            }
          }
        } else {
          this.setStatus('startingFace')
        }
      } else if (this.status === 'trackFacePositions') {
        if (exitFaceBox && !this.isFaceBoxInInsetBox(faceBox, exitFaceBox)) {
          this.reset()
        } else {
          for (const positionName in positions) {
            if (!this.screenshots[positionName]) {
              if (this.isFaceInPosition(face[0], positions[positionName])) {
                this.takeScreenshot(positionName)
              }
            }
          }
        }
      }
    } else {
      if (this.status === 'holdingFace' || this.status === 'trackFacePositions') {
        this.reset()
      } else {
        this.setStatus('searchFace')
      }
    }
  }

  takeScreenshot = (position: string) => {
    return new Promise(() => {
      const image = this.dom.canvas.toDataURL('image/jpeg', 0.92)
      this.screenshots[position] = image
      this.trigger('position', {
        position,
        image,
      })
      if (this.options.positions) {
        if (Object.keys(this.screenshots).length >= Object.keys(this.options.positions).length) {
          this.trigger('finish', this.screenshots)
        }
      }
    })
  }

  destroy = () => {
    if (this.destroyed) {
      return
    }
    this.destroyed = true
    if (this.drawTimeoutId) {
      window.clearTimeout(this.drawTimeoutId)
    }
    if (this.detectAnimationRequestId) {
      window.cancelAnimationFrame(this.detectAnimationRequestId)
    }
    if (this.dom.video) {
      this.dom.video.pause()
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        track.stop()
      })
    }
    this.removeAllListeners()
  }
}
