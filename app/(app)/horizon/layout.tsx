'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { DreamTransitionContext, type DreamPhase } from '@/components/app/horizon/dream-transition-context'

export default function HorizonLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [phase, setPhase] = useState<DreamPhase>('idle')
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])

  const triggerDream = useCallback((href: string) => {
    if (phase !== 'idle') return

    // Skip animation for reduced-motion preference
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      router.push(href)
      return
    }

    setPhase('dissolve')

    timers.current.push(
      // Phase 2: golden threshold + navigate (page swaps behind the veil)
      setTimeout(() => {
        setPhase('threshold')
        router.push(href + (href.includes('?') ? '&' : '?') + 'via=dreamgate')
      }, 400),
      // Phase 3: veil parts, new world revealed
      setTimeout(() => setPhase('reveal'), 1200),
      // Reset to idle
      setTimeout(() => setPhase('idle'), 2400),
    )
  }, [phase, router])

  // Reset on browser back/forward during transition
  useEffect(() => {
    const reset = () => {
      clearTimers()
      setPhase('idle')
    }
    window.addEventListener('popstate', reset)
    return () => window.removeEventListener('popstate', reset)
  }, [clearTimers])

  // Cleanup timers on unmount
  useEffect(() => clearTimers, [clearTimers])

  return (
    <DreamTransitionContext.Provider value={{ triggerDream, phase }}>
      {/* Page content — dissolves during exit */}
      <div className={phase === 'dissolve' ? 'dream-dissolve' : undefined}>
        {children}
      </div>

      {/* Golden veil overlay — full immersion, covers everything */}
      {phase !== 'idle' && (
        <div
          className={`dream-veil dream-veil--${phase}`}
          aria-hidden="true"
        />
      )}
    </DreamTransitionContext.Provider>
  )
}
