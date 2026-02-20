'use client'

import { BadgeGrid } from '@/components/app/badge-grid'
import { BadgeEvaluator } from '@/components/app/badge-evaluator'
import { StreakRecords } from '@/components/app/streak-records'

export default function VoortgangPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-[var(--ink)]">Voortgang</h1>
        <p className="mt-2 text-[var(--ink-3)]">
          Je streaks, prestaties en badges op je reis naar financiele vrijheid.
        </p>
      </div>

      {/* ── Streaks & Consistentie ──────────────────────────────────── */}
      <section className="mb-10 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-6 sm:p-8" data-testid="identity-streak-records">
        <h2 className="label-editorial text-[var(--ink-2)]">
          Streaks & Consistentie
        </h2>
        <p className="mt-1 mb-6 text-sm text-[var(--ink-3)]">
          Houd bij hoe consistent je bent. Elke week telt!
        </p>

        <StreakRecords />
      </section>

      {/* ── Prestaties & Badges ───────────────────────────────────── */}
      <BadgeEvaluator force={true} />
      <section className="mb-10 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-6 sm:p-8">
        <h2 className="label-editorial text-[var(--ink-2)]">
          Prestaties & Badges
        </h2>
        <p className="mt-1 mb-6 text-sm text-[var(--ink-3)]">
          Verdien badges naarmate je groeit op je reis naar financiele vrijheid.
        </p>

        <BadgeGrid />
      </section>
    </div>
  )
}
