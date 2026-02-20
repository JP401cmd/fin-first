'use client'

import { BadgeGrid } from '@/components/app/badge-grid'
import { BadgeEvaluator } from '@/components/app/badge-evaluator'
import { StreakRecords } from '@/components/app/streak-records'

export default function VoortgangPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-8">
      <div className="mb-5 sm:mb-8">
        <h1 className="text-3xl font-bold text-[var(--ink)]">Voortgang</h1>
        <p className="mt-2 text-[var(--ink-3)]">
          Je streaks, prestaties en badges op je reis naar financiele vrijheid.
        </p>
      </div>

      {/* ── Streaks & Consistentie ──────────────────────────────────── */}
      <section className="mb-5 sm:mb-8 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-8" data-testid="identity-streak-records">
        <h2 className="label-editorial text-[var(--ink-2)]">
          Streaks & Consistentie
        </h2>
        <p className="mt-1 mb-3 sm:mb-6 text-sm text-[var(--ink-3)]">
          Houd bij hoe consistent je bent. Elke week telt!
        </p>

        <StreakRecords />
      </section>

      {/* ── Prestaties & Badges ───────────────────────────────────── */}
      <BadgeEvaluator force={true} />
      <section className="mb-5 sm:mb-8 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-8">
        <h2 className="label-editorial text-[var(--ink-2)]">
          Prestaties & Badges
        </h2>
        <p className="mt-1 mb-3 sm:mb-6 text-sm text-[var(--ink-3)]">
          Verdien badges naarmate je groeit op je reis naar financiele vrijheid.
        </p>

        <BadgeGrid />
      </section>
    </div>
  )
}
