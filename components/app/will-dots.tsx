'use client'

import { useEffect, useRef, useState } from 'react'
import './will-dots.css'

/**
 * WillDots — Minimalist 3-dot avatar using module colors.
 *
 * All dots placed at center (24,24) in a 48×48 viewBox.
 * CSS animations handle positioning per state.
 *
 * States: idle, talking, thinking, listening, loading, streaming, success, error
 *
 * Idle state features:
 * - Random eye blinking (top two dots) at 2-6s intervals with ~20% double-blink
 * - Random mouth movement (bottom dot) at 3-8s intervals with ~30% multi-pulse
 * - Respects prefers-reduced-motion
 */

export interface WillDotsProps {
  size?: number // width/height in px (default 48)
  state?:
    | 'idle'
    | 'talking'
    | 'listening'
    | 'thinking'
    | 'streaming'
    | 'success'
    | 'error'
    | 'loading'
}

export function WillDots({ size = 48, state = 'idle' }: WillDotsProps) {
  const vb = 48
  const cx = 24,
    cy = 24
  const dotR = 4

  // Map streaming → loading (conceptually similar sequential pulse)
  const animState = state === 'streaming' ? 'loading' : state

  // Prevent entrance animation: skip CSS transitions on the initial render
  // so dots appear instantly at their idle positions without spreading from center.
  // Uses state (not ref) so the component re-renders with transitions enabled.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  // --- Idle random animation state ---
  const [eyeScaleY, setEyeScaleY] = useState(1)
  const [mouthScale, setMouthScale] = useState(1)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    // Only run random animations in idle state
    if (animState !== 'idle') {
      setEyeScaleY(1)
      setMouthScale(1)
      return
    }

    // Respect prefers-reduced-motion
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }

    let cancelled = false
    const timers = timersRef.current

    // --- Eye blink logic ---
    function scheduleBlink() {
      if (cancelled) return
      // Random delay 2000-6000ms
      const delay = 2000 + Math.random() * 4000
      const t = setTimeout(() => {
        if (cancelled) return
        // Blink: squeeze scaleY
        setEyeScaleY(0.1)
        const t2 = setTimeout(() => {
          if (cancelled) return
          setEyeScaleY(1)

          // ~20% chance of double-blink
          if (Math.random() < 0.2) {
            const t3 = setTimeout(() => {
              if (cancelled) return
              setEyeScaleY(0.1)
              const t4 = setTimeout(() => {
                if (cancelled) return
                setEyeScaleY(1)
                scheduleBlink()
              }, 80)
              timers.push(t4)
            }, 200)
            timers.push(t3)
          } else {
            scheduleBlink()
          }
        }, 80)
        timers.push(t2)
      }, delay)
      timers.push(t)
    }

    // --- Mouth movement logic ---
    function scheduleMouth() {
      if (cancelled) return
      // Random delay 3000-8000ms
      const delay = 3000 + Math.random() * 5000
      const t = setTimeout(() => {
        if (cancelled) return

        // ~30% chance of multi-pulse (2-3 quick pulses)
        const doMulti = Math.random() < 0.3
        const pulseCount = doMulti ? (Math.random() < 0.5 ? 2 : 3) : 1

        function doPulse(remaining: number) {
          if (cancelled || remaining <= 0) {
            scheduleMouth()
            return
          }
          // Scale up: 1.12-1.18
          const targetScale = 1.12 + Math.random() * 0.06
          setMouthScale(targetScale)
          const t2 = setTimeout(() => {
            if (cancelled) return
            setMouthScale(1)
            if (remaining > 1) {
              // Short gap between pulses
              const t3 = setTimeout(() => {
                if (cancelled) return
                doPulse(remaining - 1)
              }, 200)
              timers.push(t3)
            } else {
              scheduleMouth()
            }
          }, 150)
          timers.push(t2)
        }

        doPulse(pulseCount)
      }, delay)
      timers.push(t)
    }

    scheduleBlink()
    scheduleMouth()

    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
      timers.length = 0
    }
  }, [animState])

  // Idle triangle positions (scaled from reference 110px→48 viewBox)
  const IDLE_EYE1 = 'translate(-8px, -5px)'
  const IDLE_EYE2 = 'translate(8px, -5px)'
  const IDLE_MOUTH = 'translate(0px, 8px)'

  // Eye transforms include positioning so inline style doesn't lose translate
  const eye1Transform =
    animState === 'idle'
      ? `${IDLE_EYE1} scaleY(${eyeScaleY})`
      : undefined
  const eye2Transform =
    animState === 'idle'
      ? `${IDLE_EYE2} scaleY(${eyeScaleY})`
      : undefined

  // Mouth transform always includes positioning in idle (with optional pulse)
  const mouthTransform =
    animState === 'idle'
      ? `${IDLE_MOUTH} scale(${mouthScale})`
      : undefined

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

      {/* Pulsing ring for listening state */}
      {animState === 'listening' && (
        <circle
          cx={cx}
          cy={cy}
          r={15}
          fill="none"
          stroke="var(--color-horizon-500)"
          strokeWidth={1}
          className="will-listen-ring"
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />
      )}

      {/* Kern trail (dot-1 shadow — renders behind main dot) */}
      <circle
        cx={cx}
        cy={cy}
        r={dotR + 1}
        fill="var(--color-kern-500)"
        opacity={0.18}
        className={`will-dot will-trail will-${animState}-1`}
        style={{
          transformOrigin: `${cx}px ${cy}px`,
          transform: eye1Transform,
          transition: mounted && animState === 'idle' ? 'transform 120ms ease' : undefined,
        }}
      />
      {/* Kern dot (dot-1 / left eye) */}
      <circle
        cx={cx}
        cy={cy}
        r={dotR}
        fill="var(--color-kern-500)"
        filter="url(#will-glow-kern)"
        className={`will-dot will-${animState}-1`}
        style={{
          transformOrigin: `${cx}px ${cy}px`,
          transform: eye1Transform,
          transition: mounted && animState === 'idle' ? 'transform 80ms ease' : undefined,
        }}
      />

      {/* Wil trail (dot-2 shadow — renders behind main dot) */}
      <circle
        cx={cx}
        cy={cy}
        r={dotR + 1}
        fill="var(--color-wil-500)"
        opacity={0.18}
        className={`will-dot will-trail will-${animState}-2`}
        style={{
          transformOrigin: `${cx}px ${cy}px`,
          transform: eye2Transform,
          transition: mounted && animState === 'idle' ? 'transform 120ms ease' : undefined,
        }}
      />
      {/* Wil dot (dot-2 / right eye) */}
      <circle
        cx={cx}
        cy={cy}
        r={dotR}
        fill="var(--color-wil-500)"
        filter="url(#will-glow-wil)"
        className={`will-dot will-${animState}-2`}
        style={{
          transformOrigin: `${cx}px ${cy}px`,
          transform: eye2Transform,
          transition: mounted && animState === 'idle' ? 'transform 80ms ease' : undefined,
        }}
      />

      {/* Horizon trail (dot-3 shadow — renders behind main dot) */}
      <circle
        cx={cx}
        cy={cy}
        r={dotR + 1}
        fill="var(--color-horizon-500)"
        opacity={0.18}
        className={`will-dot will-trail will-${animState}-3`}
        style={{
          transformOrigin: `${cx}px ${cy}px`,
          transform: mouthTransform,
          transition:
            mounted && animState === 'idle' ? 'transform 140ms ease' : undefined,
        }}
      />
      {/* Horizon dot (dot-3 / mouth) */}
      <circle
        cx={cx}
        cy={cy}
        r={dotR}
        fill="var(--color-horizon-500)"
        filter="url(#will-glow-horizon)"
        className={`will-dot will-${animState}-3`}
        style={{
          transformOrigin: `${cx}px ${cy}px`,
          transform: mouthTransform,
          transition:
            mounted && animState === 'idle' ? 'transform 100ms ease' : undefined,
        }}
      />
    </svg>
  )
}

// Backward compatibility alias
export { WillDots as FinnAvatar }
