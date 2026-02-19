'use client'

import Link from 'next/link'
import { FreedomCardGenerator } from '@/components/app/freedom-card'
import { ChevronRight } from 'lucide-react'

export default function DelenPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-zinc-900">Delen</h1>
        <p className="mt-2 text-zinc-500">
          Deel je voortgang en bekijk je jaaroverzicht.
        </p>
      </div>

      {/* ── Vrijheidskaart ──────────────────────────────────────── */}
      <section className="mb-10 rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8">
        <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
          Vrijheidskaart Delen
        </h2>
        <p className="mt-1 mb-6 text-sm text-zinc-500">
          Genereer een deelbare kaart met je vrijheidsvoortgang. Kies je privacyniveau
          om te bepalen welke informatie zichtbaar is.
        </p>

        <FreedomCardGenerator />
      </section>

      {/* ── Jaaroverzicht link ──────────────────────────────────── */}
      <Link
        href="/identity/jaaroverzicht"
        className="group mb-10 flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-6 transition-all hover:border-wil-300 hover:shadow-sm sm:p-8"
      >
        <div>
          <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
            Jaaroverzicht
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Bekijk je volledige financiele jaaroverzicht met statistieken en hoogtepunten.
          </p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-zinc-300 transition-colors group-hover:text-wil-500" />
      </Link>
    </div>
  )
}
