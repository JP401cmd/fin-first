'use client'

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

/**
 * Editorial header voor /horizon/whatif (Type 10: Calculator).
 * Volgt blueprint: back-link → kicker met streep → headline met italic-em.
 */
export function WhatIfHeader() {
  return (
    <header className="mb-4 space-y-2 px-4 sm:px-6">
      {/* Back link in mono UPPERCASE */}
      <Link
        href="/horizon"
        className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] hover:text-[var(--ink)]"
      >
        <ChevronLeft className="h-3 w-3" />
        Terug naar Horizon
      </Link>

      {/* Kicker met 28×1px module-streep (Wil-actief op /horizon → Horizon-shades) */}
      <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)] mt-3">
        <span
          aria-hidden
          className="inline-block h-px w-7 shrink-0"
          style={{ background: 'var(--module-active-500)' }}
        />
        Wat als…
      </div>

      {/* Headline met italic-em "keuze" */}
      <h1
        className="font-bold leading-tight tracking-[-0.02em] text-[28px] sm:text-[36px]"
        style={{ fontFamily: 'var(--font-playfair, serif)' }}
      >
        Jouw toekomst, jouw{' '}
        <em
          className="font-normal italic"
          style={{ color: 'var(--module-active-700)' }}
        >
          keuze
        </em>
      </h1>
    </header>
  )
}
