'use client'

import Link from 'next/link'
import { FreedomCardGenerator } from '@/components/app/freedom-card'
import { ChevronRight } from 'lucide-react'

export default function DelenPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-8">
      <div className="mb-5 sm:mb-8">
        <h1 className="text-3xl font-bold text-[var(--ink)]">Delen</h1>
        <p className="mt-2 text-[var(--ink-3)]">
          Deel je voortgang en bekijk je jaaroverzicht.
        </p>
      </div>

      {/* ── Vrijheidskaart ──────────────────────────────────────── */}
      <section className="mb-5 sm:mb-8 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-8">
        <h2 className="label-editorial text-[var(--ink-2)]">
          Vrijheidskaart Delen
        </h2>
        <p className="mt-1 mb-3 sm:mb-6 text-sm text-[var(--ink-3)]">
          Genereer een deelbare kaart met je vrijheidsvoortgang. Kies je privacyniveau
          om te bepalen welke informatie zichtbaar is.
        </p>

        <FreedomCardGenerator />
      </section>

      {/* ── Jaaroverzicht link ──────────────────────────────────── */}
      <Link
        href="/identity/jaaroverzicht"
        className="group mb-5 sm:mb-8 flex items-center justify-between rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 transition-all hover:border-wil-300 hover:shadow-sm sm:p-8"
      >
        <div>
          <h2 className="label-editorial text-[var(--ink-2)]">
            Jaaroverzicht
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            Bekijk je volledige financiele jaaroverzicht met statistieken en hoogtepunten.
          </p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-[var(--ink-4)] transition-colors group-hover:text-wil-500" />
      </Link>
    </div>
  )
}
