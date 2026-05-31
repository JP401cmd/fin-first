'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

// ── Reveal on scroll (SSR-veilig) ────────────────────────────────────
//
// Content is by-default ZICHTBAAR: op de server en bij de eerste
// client-render is `mounted` false, waardoor er géén opacity/transform-gate
// in de HTML staat. Crawlers en no-JS-bezoekers zien alle content.
//
// Pas ná mount (en alleen wanneer de gebruiker geen reduced-motion wenst)
// schakelen we de animatie in: opacity 0 + translateY(28px) → zichtbaar,
// getriggerd door een IntersectionObserver.

export function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Respecteer reduced-motion: laat content statisch zichtbaar, geen animatie.
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }

    setMounted(true)

    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { threshold: 0.08, rootMargin: '0px 0px -20px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      style={
        mounted
          ? {
              transition: visible ? 'opacity 0.7s ease-out, transform 0.7s ease-out' : 'none',
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(28px)',
            }
          : undefined
      }
      className={className}
    >
      {children}
    </div>
  )
}
