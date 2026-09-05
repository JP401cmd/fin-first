'use client'

import { useState } from 'react'
import Link from 'next/link'
import { TrendingUp, ArrowRight, Plus, X } from 'lucide-react'
import { formatCurrency, formatMaskedCurrency } from '@/lib/format'
import { compareCompound } from '@/lib/compound-projection'
import { useInsightVisibility } from '@/lib/hooks/use-insight-visibility'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'

/** Canonieke id voor InsightToggleButton — match met page-mounting. */
export const COMPOUND_INSIGHT_ID = 'compound-insight'

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
 *
 * euro-view: exempt (D12) — deze kaart is een ILLUSTRATIEF rekenvoorbeeld op
 * `lib/compound-projection.ts` (twee vaste rentes, vaste 30-jaars horizon), geen
 * projectie van jouw plan. Er is dus geen kernelrij en geen canonieke
 * jaarfactor om mee te deflateren; een zelfbedachte deflator zou precies de
 * "eigen Math.pow" zijn die CLAUDE.md verbiedt. De bedragen bewegen daarom niet
 * mee met de euro-weergave — bewust, niet vergeten.
 */

const CONSERVATIVE_RATE = 0.005 // spaarrente ~0.5%
const AMBITIOUS_RATE = 0.07 // belegd lange-termijn ~7%
const HORIZON_YEARS = 30

/**
 * CTA-varianten: first-use vs. gevuld (kaart H15, uiux "Empty states").
 * "Start met beleggen" was een aansporing tot een concrete geldhandeling
 * (Wft-grens, kaart UR3-03/UR3-15) — het label is nu beschrijvend/navigatie,
 * net als CTA_INVESTED hieronder.
 */
const CTA_FIRST_USE = { label: 'Bekijk beleggen', href: '/overzicht/bezittingen' }
const CTA_INVESTED = {
  label: 'Bekijk je portefeuille',
  href: '/overzicht/bezittingen/investment?tab=aandelen-holdings',
}

export function CompoundInsightCard({
  liquidCash,
  monthlyContribution = 0,
  hasInvestments = false,
}: {
  /** Huidig liquide cash dat NU op spaarrekening staat. */
  liquidCash: number
  /** Initiële maandelijkse inleg (slider-startwaarde). Default 0. */
  monthlyContribution?: number
  /**
   * Belegt de gebruiker al? (bron: `hasInvestedAssets`, lib/dashboard-wealth-weighting).
   * Stuurt uitsluitend de CTA-variant — de rekensom en de rendergate blijven
   * op liquide cash. Beide gates keken alleen naar cash, waardoor "Start met
   * beleggen" ook verscheen naast een lopende inleg (kaart H15). Default
   * `false` houdt bestaande aanroepers op de first-use-variant.
   */
  hasInvestments?: boolean
}) {
  // Interactieve slider-state: user kan inleg variëren tussen €0 en €1000/mnd
  // om het compound-effect dynamisch te ervaren.
  const [monthly, setMonthly] = useState(monthlyContribution)
  const { visible, hide } = useInsightVisibility(COMPOUND_INSIGHT_ID)
  // Alle euro-weergaves op deze kaart honoreren de privacy-toggle — ook het
  // slider-label (monthly): één kaart met deels zichtbare bedragen breekt de
  // masking-belofte (zie werkqueue "Privacy-modus dekt álle bedragen", A6).
  const { masked } = useMaskedAmounts()
  const cta = hasInvestments ? CTA_INVESTED : CTA_FIRST_USE

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

  if (!visible) return null

  return (
    <article className="relative rounded-2xl border border-[var(--positive)]/20 bg-gradient-to-br from-[var(--positive)]/8 to-[var(--subtle)] p-4 sm:p-6">
      <button
        type="button"
        onClick={hide}
        aria-label="Inzicht minimaliseren"
        title="Minimaliseren"
        className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-[var(--positive)]/70 transition-colors hover:bg-[var(--positive)]/15 hover:text-[var(--positive)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--positive)]"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <header className="flex items-center gap-2 mb-3 pr-7">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--positive)]/15 text-[var(--positive)]">
          <TrendingUp className="w-4 h-4" aria-hidden="true" />
        </span>
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--positive)]">
            Het effect van samengestelde rente
          </div>
          <h3 className="font-serif text-base sm:text-lg text-[var(--ink)] mt-0.5">
            Wat doet je {formatMaskedCurrency(liquidCash, masked)} over {HORIZON_YEARS} jaar?
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
            <Plus className="w-3 h-3 text-[var(--positive)]" aria-hidden="true" />
            Extra €/maand inleggen
          </label>
          <span className="font-serif font-semibold text-[var(--positive)] tabular-nums text-sm">
            {formatMaskedCurrency(monthly, masked)}/mnd
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
          className="w-full accent-[var(--positive)] cursor-pointer"
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
              className="w-full max-w-[80px] rounded-t-lg bg-[var(--neutral-change)] flex items-end justify-center text-[10px] font-semibold text-[var(--ink)] pb-1"
              style={{ height: `${consPct}%` }}
            >
              {masked ? '•••' : `${Math.round(result.conservative / 1000)}k`}
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
              {formatMaskedCurrency(result.conservative, masked)}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <div className="w-full flex flex-col items-center justify-end" style={{ minHeight: 100 }}>
            <div
              className="w-full max-w-[80px] rounded-t-lg bg-gradient-to-t from-[var(--positive)] to-[var(--positive)]/80 flex items-end justify-center text-[10px] font-semibold text-white pb-1 shadow-sm"
              style={{ height: `${ambPct}%` }}
            >
              {masked ? '•••' : `${Math.round(result.ambitious / 1000)}k`}
            </div>
          </div>
          <div className="mt-2 text-center">
            <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--positive)]">
              Belegd
            </div>
            <div className="text-xs text-[var(--ink-3)]">
              {(AMBITIOUS_RATE * 100).toFixed(0)}% per jaar
            </div>
            <div className="mt-1 font-serif font-semibold text-[var(--positive)] tabular-nums">
              {formatMaskedCurrency(result.ambitious, masked)}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--positive)]/20 pt-3 mt-2 flex items-baseline justify-between gap-2 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)]">
            Het verschil
          </div>
          <div className="font-serif text-lg sm:text-xl font-bold text-[var(--positive)] tabular-nums">
            {masked ? formatMaskedCurrency(result.difference, masked) : `+${formatCurrency(result.difference)}`}
          </div>
        </div>
        <Link
          href={cta.href}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--positive)] hover:underline"
        >
          {cta.label}
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
