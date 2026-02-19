'use client'

import { BadgeGrid } from '@/components/app/badge-grid'
import { BadgeEvaluator } from '@/components/app/badge-evaluator'
import { StreakRecords } from '@/components/app/streak-records'

export default function VoortgangPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-zinc-900">Voortgang</h1>
        <p className="mt-2 text-zinc-500">
          Je streaks, prestaties en badges op je reis naar financiele vrijheid.
        </p>
      </div>

      {/* ── Streaks & Consistentie ──────────────────────────────────── */}
      <section className="mb-10 rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8" data-testid="identity-streak-records">
        <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
          Streaks & Consistentie
        </h2>
        <p className="mt-1 mb-6 text-sm text-zinc-500">
          Houd bij hoe consistent je bent. Elke week telt!
        </p>

        <StreakRecords />
      </section>

      {/* ── Prestaties & Badges ───────────────────────────────────── */}
      <BadgeEvaluator force={true} />
      <section className="mb-10 rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8">
        <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
          Prestaties & Badges
        </h2>
        <p className="mt-1 mb-6 text-sm text-zinc-500">
          Verdien badges naarmate je groeit op je reis naar financiele vrijheid.
        </p>

        <BadgeGrid />
      </section>
    </div>
  )
}
