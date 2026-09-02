'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { PageInfoButton } from '@/components/editorial'
import { getPageInfo } from '@/lib/page-info-content'

/**
 * Editorial header voor /toekomst/whatif (Type 10: Calculator).
 * Volgt blueprint: back-link → kicker met streep → headline met italic-em.
 */
export function WhatIfHeader() {
  const pathname = usePathname()
  // /toekomst/whatif toont nieuwe overzicht-tekst; /horizon/whatif fallback voor legacy
  const pageInfoText = getPageInfo(pathname, '/horizon/whatif')
  return (
    <header className="relative mb-4 space-y-2 px-4 sm:px-6">
      <PageInfoButton
        content={pageInfoText}
        className="absolute right-4 top-0 sm:right-6"
      />
      {/* Back link in mono UPPERCASE */}
      <Link
        href="/toekomst"
        className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] hover:text-[var(--ink)]"
      >
        <ChevronLeft className="h-3 w-3" />
        Terug naar Toekomst
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
