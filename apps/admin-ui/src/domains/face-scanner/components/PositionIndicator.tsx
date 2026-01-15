/**
 * PositionIndicator Component
 *
 * Visual feedback showing which face positions have been captured.
 * Displays 4 indicators (top, right, bottom, left) around the scanning area.
 */

import type { ScanPosition, PositionIndicatorState } from '../types'

interface PositionIndicatorProps {
  capturedPositions: ScanPosition[]
  debug?: boolean
}

interface IndicatorPartProps {
  position: 'top' | 'right' | 'bottom' | 'left'
  state: PositionIndicatorState
}

/**
 * Individual position indicator part
 */
function IndicatorPart({ position, state }: IndicatorPartProps) {
  const baseClasses = 'absolute transition-all duration-300 ease-out'

  // Position-specific styling
  const positionClasses = {
    top: 'top-4 left-1/2 -translate-x-1/2',
    right: 'right-4 top-1/2 -translate-y-1/2',
    bottom: 'bottom-4 left-1/2 -translate-x-1/2',
    left: 'left-4 top-1/2 -translate-y-1/2',
  }

  // State-specific styling
  const stateClasses = {
    none: 'opacity-0 scale-0',
    empty: 'opacity-50 scale-100',
    full: 'opacity-100 scale-110',
  }

  // Size based on orientation
  const sizeClasses =
    position === 'top' || position === 'bottom' ? 'w-12 h-2' : 'w-2 h-12'

  // Background color based on state
  const colorClasses = {
    none: 'bg-transparent',
    empty: 'bg-gray-400',
    full: 'bg-green-500',
  }

  return (
    <div
      className={`${baseClasses} ${positionClasses[position]} ${stateClasses[state]} ${sizeClasses} ${colorClasses[state]} rounded-full`}
      aria-label={`${position} position ${state === 'full' ? 'captured' : state === 'empty' ? 'pending' : 'inactive'}`}
    />
  )
}

/**
 * Main position indicator component
 *
 * Shows visual feedback for 4 scanning positions (top, right, bottom, left).
 * Center position is captured first and not shown in the indicator.
 */
export function PositionIndicator({ capturedPositions, debug }: PositionIndicatorProps) {
  const getPositionState = (position: ScanPosition): PositionIndicatorState => {
    // Don't show center position in indicators
    if (position === 'center') {
      return 'none'
    }

    // Check if position has been captured
    if (capturedPositions.includes(position)) {
      return 'full'
    }

    // Show empty if scanning has started (center captured)
    if (capturedPositions.includes('center')) {
      return 'empty'
    }

    return 'none'
  }

  const positions: Array<'top' | 'right' | 'bottom' | 'left'> = [
    'top',
    'right',
    'bottom',
    'left',
  ]

  return (
    <div className="absolute inset-0 pointer-events-none">
      {positions.map((position) => (
        <IndicatorPart
          key={position}
          position={position}
          state={getPositionState(position)}
        />
      ))}

      {debug && (
        <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs p-2 rounded">
          Captured: {capturedPositions.join(', ') || 'none'}
        </div>
      )}
    </div>
  )
}
