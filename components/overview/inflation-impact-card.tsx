'use client'

import { useState } from 'react'
import Link from 'next/link'
import { TrendingDown, ArrowRight } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { projectCompound } from '@/lib/compound-projection'

/**
 * InflationImpactCard — derde dramatic visualization (plan T-4 /
 * Tier-3 #24). Vult de gap die CompoundInsightCard en FeeImpactCard
 * niet adresseren: wat doet inflatie met je maandelijkse uitgaven over
 * 10/20/30 jaar?
 *
 * Plaatsing: bovenaan /overzicht/cashflow zodat de gebruiker, wanneer
 * hij of zij naar uitgaven kijkt, direct zicht heeft op de koopkracht-
 * erosie in de toekomst.
 *
 * Toon-criterium: minimaal €500/mnd aan vaste uitgaven om de
 * "dramatische" delta interessant te houden.
 */

const DEFAULT_INFLATION = 2.5
const MIN_MONTHLY_FOR_CARD = 500

export function InflationImpactCard({
  monthlyExpenses,
}: {
  /** Geschatte maandelijkse uitgaven (bv. avg over 6 mnd). */
  monthlyExpenses: number
}) {
  const [inflationPct, setInflationPct] = useState(DEFAULT_INFLATION)

  if (monthlyExpenses < MIN_MONTHLY_FOR_CARD) return null

  const rate = inflationPct / 100
  // Voor inflatie-projectie gebruik FV = monthly × (1+r)^years (van het
  // maandbedrag, niet × 12 — we tonen het effect op één maand).
  function futureMonthly(years: number): number {
    return projectCompound(monthlyExpenses, 0, years, rate)
  }
  const in10 = futureMonthly(10)
  const in20 = futureMonthly(20)
  const in30 = futureMonthly(30)
  const delta30 = in30 - monthlyExpenses
  const deltaPct30 = monthlyExpenses > 0
    ? Math.round((delta30 / monthlyExpenses) * 100)
    : 0

  return (
    <article className="rounded-2xl border border-[var(--border-ed)] bg-gradient-to-br from-amber-50/60 to-stone-50 p-4 sm:p-6">
      <header className="flex items-start gap-3 mb-4">
        <span className="inline-flex w-9 h-9 rounded-lg bg-amber-100 text-amber-700 items-center justify-center shrink-0">
          <TrendingDown className="w-4 h-4" aria-hidden="true" />
        </span>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-amber-700">
            Inflatie & koopkracht
          </div>
          <h3 className="font-serif text-lg sm:text-xl text-[var(--ink)] mt-0.5 leading-snug">
            Je {formatCurrency(Math.round(monthlyExpenses))}/maand wordt over 30
            jaar{' '}
            <span className="text-amber-700">
              {formatCurrency(Math.round(in30))}
            </span>{' '}
            voor dezelfde levensstandaard
          </h3>
          <p className="text-xs text-[var(--ink-2)] mt-1 leading-snug">
            Bij {inflationPct.toFixed(1)}% inflatie — een conservatieve NL-
            aanname (CBS-gemiddelde 2.0-3.0%).
          </p>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
        <HorizonTile years={10} value={in10} accent="amber-700" />
        <HorizonTile years={20} value={in20} accent="amber-700" />
        <HorizonTile years={30} value={in30} accent="amber-700" />
      </div>

      <label className="block">
        <div className="flex items-baseline justify-between gap-2 mb-1.5">
          <span className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)]">
            Inflatie-aanname
          </span>
          <span className="text-xs font-semibold text-amber-700 tabular-nums">
            {inflationPct.toFixed(1)}%
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={5}
          step={0.1}
          value={inflationPct}
          onChange={(e) => setInflationPct(Number(e.target.value))}
          aria-label="Inflatie-aanname in procent per jaar"
          className="w-full accent-amber-600"
        />
        <div className="flex items-center justify-between text-[10px] text-[var(--ink-3)] mt-1 tabular-nums">
          <span>1%</span>
          <span>2.5% (CBS gem.)</span>
          <span>5%</span>
        </div>
      </label>

      {delta30 > 0 && (
        <div className="mt-4 flex items-center justify-between gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold bg-amber-100 text-amber-800">
            <TrendingDown className="w-3.5 h-3.5" aria-hidden="true" />
            +{deltaPct30}% nominaal nodig over 30 jaar
          </div>
          <Link
            href="/toekomst/inflatie-koopkracht"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:underline"
          >
            Verdiep — koopkracht-analyse
            <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </Link>
        </div>
      )}
    </article>
  )
}

function HorizonTile({
  years,
  value,
  accent,
}: {
  years: number
  value: number
  accent: string
}) {
  return (
    <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-3 text-center">
      <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)]">
        Over {years} jaar
      </div>
      <div
        className={`font-serif text-base sm:text-lg font-semibold tabular-nums mt-0.5 text-${accent}`}
      >
        {formatCurrency(Math.round(value))}
      </div>
    </div>
  )
}
