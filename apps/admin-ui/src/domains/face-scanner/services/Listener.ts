/**
 * Event Listener / Event Emitter
 *
 * Simple pub/sub pattern for event-driven communication between
 * FaceRecognitionService and React components.
 */

type Handler = (data?: any, event?: string) => void

/**
 * Base class for event-driven services
 *
 * @example
 * ```ts
 * class MyService extends Listener {
 *   doSomething() {
 *     this.trigger('data', { value: 42 })
 *   }
 * }
 *
 * const service = new MyService()
 * service.on('data', (data) => console.log(data.value))
 * ```
 */
export default class Listener {
  private eventHandlers: {
    [key: string]: Handler[]
  } = {}

  /**
   * Subscribe to an event
   *
   * @param event - Event name to listen for
   * @param handler - Callback function to execute when event fires
   * @returns Unsubscribe function
   */
  on(event: string, handler: Handler): () => void {
    if (!(event in this.eventHandlers)) {
      this.eventHandlers[event] = []
    }

    this.eventHandlers[event].push(handler)

    // Return unsubscribe function
    return () => {
      this.off(event, handler)
    }
  }

  /**
   * Unsubscribe from an event
   *
   * @param event - Event name
   * @param handler - Handler to remove
   */
  off(event: string, handler: Handler): void {
    if (!(event in this.eventHandlers)) {
      return
    }

    this.eventHandlers[event] = this.eventHandlers[event].filter((x) => x !== handler)
  }

  /**
   * Emit an event with optional data
   *
   * Special event '@' will receive all events (wildcard listener)
   *
   * @param event - Event name to trigger
   * @param data - Data to pass to handlers
   */
  trigger(event: string, data?: unknown): void {
    // Trigger wildcard listeners (if any)
    if ('@' in this.eventHandlers) {
      this.eventHandlers['@'].forEach((handler) => handler(data, event))
    }

    // Trigger specific event listeners
    if (!(event in this.eventHandlers)) {
      return
    }
    this.eventHandlers[event].forEach((handler) => handler(data, event))
  }

  /**
   * Remove all event handlers
   */
  removeAllListeners(): void {
    this.eventHandlers = {}
  }

  /**
   * Get list of registered event names
   */
  getEventNames(): string[] {
    return Object.keys(this.eventHandlers)
  }

  /**
   * Get number of handlers for a specific event
   */
  listenerCount(event: string): number {
    return this.eventHandlers[event]?.length ?? 0
  }
}
