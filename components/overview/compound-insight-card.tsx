'use client'

import { useState } from 'react'
import Link from 'next/link'
import { TrendingUp, ArrowRight, Plus } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { compareCompound } from '@/lib/compound-projection'

/**
 * CompoundInsightCard — "moment of realization"-card die laat zien wat
 * compound interest doet over een lange horizon. Plan T-4 (Tier-3 #24):
 * "Dramatic visualization voor enkele kerntips — bv. impact beheerkosten
 * over 30 jaar." Geïnspireerd door Empower fee-analyzer (plan §2.6).
 *
 * Standaardvergelijking: spaarrekening (0.5%) vs belegd (7%) over 30
 * jaar met huidige liquide cash als startbedrag en optioneel
 * maandelijkse inleg. Visueel: twee balken naast elkaar waarbij de
 * belegde balk dramatisch boven de spaargeld-balk uitsteekt.
 *
 * Showcase-criterium: card alleen renderen wanneer hasDramaticDelta=true
 * (= ambitious is ≥5% groter dan conservative). Voorkomt dat we users
 * zonder cash of zonder lange horizon irrelevante content tonen.
 */

const CONSERVATIVE_RATE = 0.005 // spaarrente ~0.5%
const AMBITIOUS_RATE = 0.07 // belegd lange-termijn ~7%
const HORIZON_YEARS = 30

export function CompoundInsightCard({
  liquidCash,
  monthlyContribution = 0,
}: {
  /** Huidig liquide cash dat NU op spaarrekening staat. */
  liquidCash: number
  /** Initiële maandelijkse inleg (slider-startwaarde). Default 0. */
  monthlyContribution?: number
}) {
  // Interactieve slider-state: user kan inleg variëren tussen €0 en €1000/mnd
  // om het compound-effect dynamisch te ervaren.
  const [monthly, setMonthly] = useState(monthlyContribution)

  const result = compareCompound({
    principal: liquidCash,
    monthlyContribution: monthly,
    years: HORIZON_YEARS,
    conservativeRate: CONSERVATIVE_RATE,
    ambitiousRate: AMBITIOUS_RATE,
  })

  // Verberg de card bij te kleine delta — geen dramatic-impact.
  if (!result.hasDramaticDelta) return null

  // Balk-hoogte proportioneel aan de twee getallen, met conservative
  // op een minimum van 30% zodat hij altijd zichtbaar is.
  const maxValue = Math.max(result.conservative, result.ambitious)
  const consPct = Math.max(30, (result.conservative / maxValue) * 100)
  const ambPct = (result.ambitious / maxValue) * 100

  return (
    <article className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/50 to-stone-50 p-4 sm:p-6">
      <header className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700">
          <TrendingUp className="w-4 h-4" aria-hidden="true" />
        </span>
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-emerald-700">
            Het effect van samengestelde rente
          </div>
          <h3 className="font-serif text-base sm:text-lg text-[var(--ink)] mt-0.5">
            Wat doet je {formatCurrency(liquidCash)} over {HORIZON_YEARS} jaar?
          </h3>
        </div>
      </header>

      {/* Interactieve slider — user past maandelijkse inleg aan en ziet
          de twee balken live updaten. Hands-on betrokkenheid maakt
          compound interest tastbaarder dan een statisch getal. */}
      <div className="mt-4 mb-1">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <label
            htmlFor="compound-monthly"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--ink-2)]"
          >
            <Plus className="w-3 h-3 text-emerald-700" aria-hidden="true" />
            Extra €/maand inleggen
          </label>
          <span className="font-serif font-semibold text-emerald-700 tabular-nums text-sm">
            {formatCurrency(monthly)}/mnd
          </span>
        </div>
        <input
          id="compound-monthly"
          type="range"
          min={0}
          max={1000}
          step={25}
          value={monthly}
          onChange={(e) => setMonthly(Number(e.target.value))}
          className="w-full accent-emerald-600 cursor-pointer"
          aria-label="Maandelijkse extra inleg"
        />
        <div className="flex justify-between text-[9px] text-[var(--ink-4)] mt-0.5">
          <span>€ 0</span>
          <span>€ 500</span>
          <span>€ 1.000</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:gap-6 items-end mb-3 mt-4 min-h-[120px]">
        <div className="flex flex-col items-center">
          <div className="w-full flex flex-col items-center justify-end" style={{ minHeight: 100 }}>
            <div
              className="w-full max-w-[80px] rounded-t-lg bg-stone-300 flex items-end justify-center text-[10px] font-semibold text-stone-700 pb-1"
              style={{ height: `${consPct}%` }}
            >
              {Math.round((result.conservative / 1000))}k
            </div>
          </div>
          <div className="mt-2 text-center">
            <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)]">
              Op spaarrekening
            </div>
            <div className="text-xs text-[var(--ink-3)]">
              {(CONSERVATIVE_RATE * 100).toFixed(1)}% per jaar
            </div>
            <div className="mt-1 font-serif font-semibold text-[var(--ink-2)] tabular-nums">
              {formatCurrency(result.conservative)}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <div className="w-full flex flex-col items-center justify-end" style={{ minHeight: 100 }}>
            <div
              className="w-full max-w-[80px] rounded-t-lg bg-gradient-to-t from-emerald-500 to-emerald-400 flex items-end justify-center text-[10px] font-semibold text-white pb-1 shadow-sm"
              style={{ height: `${ambPct}%` }}
            >
              {Math.round(result.ambitious / 1000)}k
            </div>
          </div>
          <div className="mt-2 text-center">
            <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-emerald-700">
              Belegd
            </div>
            <div className="text-xs text-[var(--ink-3)]">
              {(AMBITIOUS_RATE * 100).toFixed(0)}% per jaar
            </div>
            <div className="mt-1 font-serif font-semibold text-emerald-700 tabular-nums">
              {formatCurrency(result.ambitious)}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-emerald-100 pt-3 mt-2 flex items-baseline justify-between gap-2 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)]">
            Het verschil
          </div>
          <div className="font-serif text-lg sm:text-xl font-bold text-emerald-700 tabular-nums">
            +{formatCurrency(result.difference)}
          </div>
        </div>
        <Link
          href="/overzicht/bezittingen"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline"
        >
          Start met beleggen
          <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </Link>
      </div>

      <p className="mt-3 text-[10px] italic text-[var(--ink-4)] leading-snug">
        Aanname: {(CONSERVATIVE_RATE * 100).toFixed(1)}% spaarrente vs {(AMBITIOUS_RATE * 100).toFixed(0)}% jaarrendement
        op een gespreide aandelenportefeuille. Werkelijke rendementen
        variëren — historische resultaten zijn geen garantie.
      </p>
    </article>
  )
}
