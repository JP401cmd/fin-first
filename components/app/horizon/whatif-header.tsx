'use client'

import Link from 'next/link'
import { ChevronLeft, Sparkles } from 'lucide-react'

export function WhatIfHeader() {
  return (
    <div className="mb-6">
      {/* Back link */}
      <Link
        href="/horizon"
        className="inline-flex items-center gap-1 font-serif text-sm italic text-wil-600 transition-colors hover:text-wil-700"
      >
        <ChevronLeft className="h-4 w-4" />
        De Horizon
      </Link>

      {/* Kicker */}
      <div className="mt-3 flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-wil-600" />
        <span className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-wil-600">
          Wat als...
        </span>
      </div>

      {/* Subtitle */}
      <p className="mt-1 font-serif text-[13px] italic text-[var(--ink-3)]">
        Speel met de knoppen en ontdek hoe keuzes je toekomst veranderen.
      </p>
    </div>
  )
}
