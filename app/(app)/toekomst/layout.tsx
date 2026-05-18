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
      {/* Page content — dissolves during exit. Module-active CSS-variabelen
          worden hier gezet op Horizon-shades zodat editorial primitives
          (kicker-streep, headline-emphasis, highlight-marker) automatisch
          zandgoud-getint zijn op alle /horizon/** pagina's. */}
      <div
        className={phase === 'dissolve' ? 'dream-dissolve' : undefined}
        style={
          {
            '--module-active-50': 'var(--color-horizon-50)',
            '--module-active-100': 'var(--color-horizon-100)',
            '--module-active-200': 'var(--color-horizon-200)',
            '--module-active-300': 'var(--color-horizon-300)',
            '--module-active-400': 'var(--color-horizon-400)',
            '--module-active-500': 'var(--color-horizon-500)',
            '--module-active-600': 'var(--color-horizon-600)',
            '--module-active-700': 'var(--color-horizon-700)',
            '--module-active-800': 'var(--color-horizon-800)',
            '--module-active-900': 'var(--color-horizon-900)',
            '--module-active-950': 'var(--color-horizon-950)',
          } as React.CSSProperties
        }
      >
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
