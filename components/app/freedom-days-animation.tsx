'use client'

import { useState, useCallback, createContext, useContext, useRef, useEffect } from 'react'

// --- Context for triggering freedom days animations across the page ---

type FreedomDaysAnimationContextType = {
  triggerAnimation: (days: number) => void
}

const FreedomDaysAnimationContext = createContext<FreedomDaysAnimationContextType>({
  triggerAnimation: () => {},
})

export function useFreedomDaysAnimation() {
  return useContext(FreedomDaysAnimationContext)
}

type AnimationItem = {
  id: number
  days: number
  x: number
  y: number
}

/**
 * Provider that wraps the De Wil page and provides animation capabilities.
 * When triggerAnimation is called, a floating "+X.X dagen" text appears
 * and floats upward while fading out.
 */
export function FreedomDaysAnimationProvider({ children }: { children: React.ReactNode }) {
  const [animations, setAnimations] = useState<AnimationItem[]>([])
  const nextId = useRef(0)

  const triggerAnimation = useCallback((days: number) => {
    if (days <= 0) return

    const id = nextId.current++
    // Position near center-right of viewport, with slight randomization
    const x = 50 + (Math.random() * 20 - 10) // 40-60% from left
    const y = 35 + (Math.random() * 10 - 5) // 30-40% from top

    setAnimations((prev) => [...prev, { id, days, x, y }])

    // Remove after animation completes (2s)
    setTimeout(() => {
      setAnimations((prev) => prev.filter((a) => a.id !== id))
    }, 2200)
  }, [])

  return (
    <FreedomDaysAnimationContext.Provider value={{ triggerAnimation }}>
      {children}
      {/* Floating animation overlay */}
      {animations.length > 0 && (
        <div
          className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
          aria-hidden="true"
          data-testid="freedom-days-animation-overlay"
        >
          {animations.map((anim) => (
            <FloatingDaysText key={anim.id} days={anim.days} x={anim.x} y={anim.y} />
          ))}
        </div>
      )}
    </FreedomDaysAnimationContext.Provider>
  )
}

/**
 * Individual floating "+X.X dagen" animation element.
 * Floats up and fades out over 2 seconds.
 */
function FloatingDaysText({ days, x, y }: { days: number; x: number; y: number }) {
  const [phase, setPhase] = useState<'enter' | 'float'>('enter')

  useEffect(() => {
    // Trigger float animation on next frame
    const raf = requestAnimationFrame(() => {
      setPhase('float')
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  const formattedDays = days % 1 === 0 ? days.toString() : days.toFixed(1)

  return (
    <div
      className="absolute transition-all duration-[2000ms] ease-out"
      style={{
        left: `${x}%`,
        top: phase === 'enter' ? `${y}%` : `${y - 25}%`,
        opacity: phase === 'enter' ? 1 : 0,
        transform: `translateX(-50%) scale(${phase === 'enter' ? 1.1 : 0.85})`,
      }}
      data-testid="freedom-days-floating-text"
    >
      <div className="flex flex-col items-center">
        <span className="whitespace-nowrap text-3xl font-bold text-teal-400 drop-shadow-lg sm:text-4xl md:text-5xl"
          style={{
            textShadow: '0 0 20px rgba(20, 184, 166, 0.4), 0 2px 8px rgba(0, 0, 0, 0.3)',
          }}
        >
          +{formattedDays}
        </span>
        <span
          className="mt-1 whitespace-nowrap text-base font-semibold text-teal-300 drop-shadow-md sm:text-lg"
          style={{
            textShadow: '0 0 12px rgba(20, 184, 166, 0.3), 0 1px 4px rgba(0, 0, 0, 0.2)',
          }}
        >
          {days === 1 ? 'vrijheidsdag' : 'vrijheidsdagen'}
        </span>
      </div>
    </div>
  )
}

/**
 * Inline animation component for the action board area.
 * Shows a smaller floating "+X dagen" near the action that was completed.
 */
export function InlineFloatingDays({
  days,
  onComplete,
}: {
  days: number
  onComplete?: () => void
}) {
  const [phase, setPhase] = useState<'enter' | 'float'>('enter')

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setPhase('float')
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete?.()
    }, 1500)
    return () => clearTimeout(timer)
  }, [onComplete])

  if (days <= 0) return null

  const formattedDays = days % 1 === 0 ? days.toString() : days.toFixed(1)

  return (
    <span
      className="pointer-events-none absolute -top-1 right-2 z-10 transition-all duration-[1500ms] ease-out"
      style={{
        opacity: phase === 'enter' ? 1 : 0,
        transform: `translateY(${phase === 'enter' ? '0' : '-40px'}) scale(${phase === 'enter' ? 1 : 0.7})`,
      }}
      data-testid="inline-floating-days"
    >
      <span className="whitespace-nowrap rounded-full bg-teal-500/90 px-2.5 py-1 text-sm font-bold text-white shadow-lg">
        +{formattedDays} {days === 1 ? 'dag' : 'dagen'}
      </span>
    </span>
  )
}
