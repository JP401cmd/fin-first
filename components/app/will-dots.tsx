'use client'

import { useEffect, useState } from 'react'

/**
 * WillDots — Minimalist 3-dot avatar using module colors.
 *
 * Triangle formation (idle):
 *   Kern (left-top)   Wil (right-top)
 *          Horizon (bottom-center)
 *
 * States: idle, talking, thinking, listening, streaming, success, error
 */

export interface WillDotsProps {
  size?: number        // width/height in px (default 48)
  state?: 'idle' | 'talking' | 'listening' | 'thinking' | 'streaming' | 'success' | 'error'
}

export function WillDots({ size = 48, state = 'idle' }: WillDotsProps) {
  // For one-shot animations (success/error), revert to idle after animation completes
  const [activeState, setActiveState] = useState(state)

  useEffect(() => {
    setActiveState(state)
    if (state === 'success' || state === 'error') {
      const ms = state === 'success' ? 700 : 400
      const t = setTimeout(() => setActiveState('idle'), ms)
      return () => clearTimeout(t)
    }
  }, [state])

  // ViewBox is 48x48 (design space), component scales via width/height
  const vb = 48

  // Triangle positions in the 48x48 viewBox
  const kernCx = 15, kernCy = 16
  const wilCx = 33, wilCy = 16
  const horizonCx = 24, horizonCy = 32

  // Dot radius in viewBox space
  const dotR = vb / 6 // = 8

  // Center of the triangle (for thinking rotation)
  const cx = 24, cy = 21.33

  // Determine CSS class names per state
  const groupClass = getGroupClass(activeState)
  const kernClass = getDotClass(activeState, 'kern')
  const wilClass = getDotClass(activeState, 'wil')
  const horizonClass = getDotClass(activeState, 'horizon')

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${vb} ${vb}`}
      role="img"
      aria-label="Will avatar"
    >
      <defs>
        <filter id="will-glow-kern" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id="will-glow-wil" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id="will-glow-horizon" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Outer group for whole-avatar animations (breathing, success bounce, error shake) */}
      <g
        className={groupClass}
        style={activeState === 'thinking' ? { transformOrigin: `${cx}px ${cy}px` } : undefined}
      >
        {/* Kern dot (top-left) */}
        <circle
          cx={kernCx}
          cy={kernCy}
          r={dotR}
          fill="var(--color-kern-500)"
          filter="url(#will-glow-kern)"
          className={kernClass}
          style={{ transformOrigin: `${kernCx}px ${kernCy}px` }}
        />

        {/* Wil dot (top-right) */}
        <circle
          cx={wilCx}
          cy={wilCy}
          r={dotR}
          fill="var(--color-wil-500)"
          filter="url(#will-glow-wil)"
          className={wilClass}
          style={{ transformOrigin: `${wilCx}px ${wilCy}px` }}
        />

        {/* Horizon dot (bottom-center) */}
        <circle
          cx={horizonCx}
          cy={horizonCy}
          r={dotR}
          fill="var(--color-horizon-500)"
          filter="url(#will-glow-horizon)"
          className={horizonClass}
          style={{ transformOrigin: `${horizonCx}px ${horizonCy}px` }}
        />
      </g>
    </svg>
  )
}

/** Determine the animation class for the outer <g> group */
function getGroupClass(state: string): string {
  switch (state) {
    case 'idle':      return 'will-breathe-group'
    case 'thinking':  return 'will-think-group'
    case 'success':   return 'will-success-group'
    case 'error':     return 'will-error-group'
    default:          return ''
  }
}

/** Determine animation class for individual dots */
function getDotClass(state: string, dot: 'kern' | 'wil' | 'horizon'): string {
  switch (state) {
    case 'idle':
      // Only top two dots blink
      return dot === 'horizon' ? '' : 'will-blink-dot'
    case 'talking':
      if (dot === 'kern')    return 'will-talk-1'
      if (dot === 'wil')     return 'will-talk-2'
      return 'will-talk-3'
    case 'listening':
      return 'will-listen-dot'
    case 'streaming':
      if (dot === 'kern')    return 'will-stream-1'
      if (dot === 'wil')     return 'will-stream-2'
      return 'will-stream-3'
    case 'thinking':
      if (dot === 'kern')    return 'will-think-dot-1'
      if (dot === 'wil')     return 'will-think-dot-2'
      return 'will-think-dot-3'
    default:
      return ''
  }
}

// Backward compatibility alias
export { WillDots as FinnAvatar }
