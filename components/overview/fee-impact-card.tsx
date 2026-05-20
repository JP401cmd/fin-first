'use client'

import { useState } from 'react'
import { Percent, TrendingDown } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { projectCompound } from '@/lib/compound-projection'

/**
 * FeeImpactCard — tweede "moment of realization"-card (plan T-4 /
 * Tier-3 #24). Toont wat 0.5% extra beheerkosten kosten over de horizon
 * tot het vrijheidsmoment. Geïnspireerd door Empower's fee-analyzer (§2.6).
 *
 * Toon-criterium: gebruiker heeft ≥ €25k aan beleggingen. Voor lagere
 * portefeuilles zijn de absolute verschillen te klein om "dramatisch"
 * te zijn — dan blijft de card weg.
 *
 * Slider: gebruiker schuift met extra-fee tussen 0% en 1.5%. Default 0.5%
 * matcht het plan-citaat.
 */

const BASE_GROWTH_RATE = 0.07 // belegd lange-termijn ~7%
const DEFAULT_HORIZON_YEARS = 30
const MIN_PORTFOLIO_FOR_CARD = 25_000

export function FeeImpactCard({
  investmentTotal,
  yearsToFreedom,
}: {
  investmentTotal: number
  /** Jaren tot vrijheidsmoment. Wanneer null/onbekend: 30 jaar default. */
  yearsToFreedom?: number | null
}) {
  // Interactieve slider voor extra beheerkosten — laat user zien hoe
  // gevoelig de eindwaarde is.
  const [extraFeePct, setExtraFeePct] = useState(0.5)

  if (investmentTotal < MIN_PORTFOLIO_FOR_CARD) return null

  const years = yearsToFreedom && yearsToFreedom > 0 ? yearsToFreedom : DEFAULT_HORIZON_YEARS
  const noFeeValue = projectCompound(investmentTotal, 0, years, BASE_GROWTH_RATE)
  const withFeeValue = projectCompound(
    investmentTotal,
    0,
    years,
    Math.max(0, BASE_GROWTH_RATE - extraFeePct / 100),
  )
  const cost = noFeeValue - withFeeValue
  const costPct = noFeeValue > 0 ? Math.round((cost / noFeeValue) * 100) : 0

  // Bar-heights voor visuele vergelijking. Hoogste = 100%, ander relatief.
  const maxValue = Math.max(noFeeValue, withFeeValue, 1)
  const noFeeBar = (noFeeValue / maxValue) * 100
  const withFeeBar = (withFeeValue / maxValue) * 100

  return (
    <article className="rounded-2xl border border-[var(--border-ed)] bg-gradient-to-br from-rose-50/60 to-stone-50 p-4 sm:p-6">
      <header className="flex items-start gap-3 mb-4">
        <span className="inline-flex w-9 h-9 rounded-lg bg-rose-100 text-rose-700 items-center justify-center shrink-0">
          <Percent className="w-4 h-4" aria-hidden="true" />
        </span>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-rose-700">
            Wat kosten fees je?
          </div>
          <h3 className="font-serif text-lg sm:text-xl text-[var(--ink)] mt-0.5 leading-snug">
            {extraFeePct.toFixed(1)}% extra beheerkosten kost je{' '}
            <span className="text-rose-700">{formatCurrency(Math.round(cost))}</span>{' '}
            over {years} jaar
          </h3>
          <p className="text-xs text-[var(--ink-2)] mt-1 leading-snug">
            Op €{formatCurrency(Math.round(investmentTotal)).replace('€', '')} belegd
            vermogen — bij {(BASE_GROWTH_RATE * 100).toFixed(0)}% jaarrendement.
          </p>
        </div>
      </header>

      {/* Twee balken naast elkaar — visueel verschil-effect. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4">
        <BarVisualization
          label="Zonder extra fee"
          value={noFeeValue}
          barPct={noFeeBar}
          tone="positive"
        />
        <BarVisualization
          label={`Met ${extraFeePct.toFixed(1)}% extra`}
          value={withFeeValue}
          barPct={withFeeBar}
          tone="negative"
        />
      </div>

      {/* Slider: extra fee 0 – 1.5% */}
      <label className="block">
        <div className="flex items-baseline justify-between gap-2 mb-1.5">
          <span className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)]">
            Extra beheerkosten
          </span>
          <span className="text-xs font-semibold text-rose-700 tabular-nums">
            {extraFeePct.toFixed(1)}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={1.5}
          step={0.1}
          value={extraFeePct}
          onChange={(e) => setExtraFeePct(Number(e.target.value))}
          aria-label="Extra beheerkosten in procent"
          className="w-full accent-rose-600"
        />
        <div className="flex items-center justify-between text-[10px] text-[var(--ink-3)] mt-1 tabular-nums">
          <span>0%</span>
          <span>0.5% (gemiddeld ETF-broker)</span>
          <span>1.5%</span>
        </div>
      </label>

      {cost > 0 && (
        <div className="mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold bg-rose-100 text-rose-800">
          <TrendingDown className="w-3.5 h-3.5" aria-hidden="true" />
          {costPct}% van je eindwaarde gaat naar fees
        </div>
      )}
    </article>
  )
}

function BarVisualization({
  label,
  value,
  barPct,
  tone,
}: {
  label: string
  value: number
  barPct: number
  tone: 'positive' | 'negative'
}) {
  const fillColor =
    tone === 'positive' ? 'bg-emerald-500' : 'bg-rose-500'
  const textColor = tone === 'positive' ? 'text-emerald-700' : 'text-rose-700'
  return (
    <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-3">
      <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)] mb-1.5 truncate">
        {label}
      </div>
      <div className={`font-serif text-base sm:text-lg font-semibold ${textColor} tabular-nums mb-2`}>
        {formatCurrency(Math.round(value))}
      </div>
      <div
        className="h-2 rounded-full bg-[var(--subtle)] overflow-hidden"
        role="img"
        aria-label={`${label}: ${Math.round(barPct)}%`}
      >
        <div
          className={`h-full ${fillColor} transition-all duration-500`}
          style={{ width: `${barPct}%` }}
        />
      </div>
    </div>
  )
}
