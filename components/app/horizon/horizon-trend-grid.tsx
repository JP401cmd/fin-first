'use client'

import { ChevronDown, Heart, Hourglass } from 'lucide-react'
import { FeatureGate } from '@/components/app/feature-gate'
import {
  ResilienceContextMessage,
  ResilienceTrendChart,
  FireAgeContextMessage,
  FireAgeTrendChart,
  type SnapshotForTrend,
} from '@/components/app/horizon/horizon-helpers'

type HorizonTrendGridProps = {
  /** Alle snapshots (oudste → nieuwste) voor de verloop-charts. */
  resilienceSnapshots: SnapshotForTrend[]
  /**
   * Live gezondheidsscore-totaal. Dit is overal het "huidige" getal — de badge
   * + title tonen ALTIJD deze live score (SSoT, Defect A). De opgeslagen
   * snapshot-resilience voedt nog wél de historische trendgrafiek hieronder via
   * `resilienceSnapshots`, maar niet langer het huidige getal.
   */
  healthScoreTotal: number
  healthChartOpen: boolean
  onToggleHealth: () => void
  fireAgeChartOpen: boolean
  onToggleFireAge: () => void
  /** Opent de gezondheids-kassabon (resilience receipt). */
  onOpenResilienceReceipt: () => void
}

/**
 * Verloop-grid: Gezondheids- + FIRE-leeftijd-trend (Deep Dive).
 *
 * Geëxtraheerd uit `horizon-client.tsx` (sectie 5b) als zelfstandige,
 * prop-gedreven presentatie-component — leest géén sim-state, alle data
 * en callbacks komen via props. Eerste stap van de horizon-monoliet-
 * decompositie.
 */
export function HorizonTrendGrid({
  resilienceSnapshots,
  healthScoreTotal,
  healthChartOpen,
  onToggleHealth,
  fireAgeChartOpen,
  onToggleFireAge,
  onOpenResilienceReceipt,
}: HorizonTrendGridProps) {
  const fireAgeSnapshots = resilienceSnapshots.filter(
    (s) => s.fire_age !== null && s.fire_age !== undefined,
  )
  const hasFireTrend = fireAgeSnapshots.length >= 2
  const last = hasFireTrend ? fireAgeSnapshots[fireAgeSnapshots.length - 1] : null
  const lastAge = last ? (last.fire_age as number) : null

  return (
    <div className="mt-5 grid gap-4 sm:mt-8 sm:gap-5 lg:grid-cols-2">
      {/* ── Gezondheidsverloop ── */}
      <FeatureGate featureId="gezondheids_score" fallback="hidden">
        <section data-testid="health-trend-section">
          <div className="h-full overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s0)]">
            {/* Accent bar */}
            <div className="h-[3px] w-full bg-horizon-500" />

            {/* Header (clickable toggle) */}
            <button
              type="button"
              onClick={onToggleHealth}
              aria-expanded={healthChartOpen}
              className="flex w-full items-center gap-3 border-b border-[var(--border-ed)] px-4 py-4 text-left transition-colors hover:bg-[var(--subtle)] sm:px-5"
            >
              <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform duration-200 ${healthChartOpen ? 'rotate-180' : ''}`} />
              <div className="flex min-w-0 flex-1 items-center justify-between">
                <div className="flex items-center gap-2">
                  <Heart className="h-4 w-4 fill-horizon-500 text-horizon-500" />
                  <h3 className="label-editorial text-[var(--ink-2)]">Gezondheidsverloop</h3>
                </div>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); onOpenResilienceReceipt() }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onOpenResilienceReceipt() } }}
                  className="flex items-center gap-1.5 rounded-full bg-horizon-50 px-2.5 py-1 transition-colors hover:bg-horizon-100"
                  data-testid="health-score-card"
                  title={`Financiële Gezondheid: ${healthScoreTotal} / 100`}
                >
                  <Heart className="h-3.5 w-3.5 fill-horizon-500 text-horizon-500" />
                  <span className="font-mono text-sm font-semibold tabular-nums text-horizon-700">
                    {healthScoreTotal}/100
                  </span>
                </div>
              </div>
            </button>

            {/* Content */}
            {healthChartOpen && (
              resilienceSnapshots.filter((s) => s.resilience_score !== null).length >= 2 ? (
                <button
                  type="button"
                  onClick={onOpenResilienceReceipt}
                  className="w-full cursor-pointer p-4 text-left transition-colors hover:bg-[var(--subtle)] sm:p-6"
                >
                  <ResilienceContextMessage snapshots={resilienceSnapshots} />
                  <ResilienceTrendChart snapshots={resilienceSnapshots} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenResilienceReceipt}
                  className="w-full cursor-pointer p-6 text-center transition-colors hover:bg-[var(--subtle)] sm:p-8"
                >
                  <Heart className="mx-auto mb-2 h-8 w-8 text-horizon-300" />
                  <p className="text-sm text-[var(--ink-3)]">
                    Gebruik de app langer om het verloop in je financiële gezondheid weer te geven
                  </p>
                </button>
              )
            )}
          </div>
        </section>
      </FeatureGate>

      {/* ── FIRE-leeftijd-verloop ── */}
      <section data-testid="fire-age-trend-section">
        <div className="h-full overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s0)]">
          {/* Accent bar */}
          <div className="h-[3px] w-full bg-horizon-500" />

          {/* Header (clickable toggle) */}
          <button
            type="button"
            onClick={onToggleFireAge}
            aria-expanded={fireAgeChartOpen}
            className="flex w-full items-center gap-3 border-b border-[var(--border-ed)] px-4 py-4 text-left transition-colors hover:bg-[var(--subtle)] sm:px-5"
          >
            <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform duration-200 ${fireAgeChartOpen ? 'rotate-180' : ''}`} />
            <div className="flex min-w-0 flex-1 items-center justify-between">
              <div className="flex items-center gap-2">
                <Hourglass className="h-4 w-4 text-horizon-500" />
                <h3 className="label-editorial text-[var(--ink-2)]">FIRE-verloop</h3>
              </div>
              {lastAge !== null && (
                <div
                  className="flex items-center gap-1.5 rounded-full bg-horizon-50 px-2.5 py-1"
                  title={`Huidige FIRE-leeftijd: ${Math.round(lastAge)} jaar`}
                >
                  <Hourglass className="h-3.5 w-3.5 text-horizon-500" />
                  <span className="font-mono text-sm font-semibold tabular-nums text-horizon-700">
                    {Math.round(lastAge)} jr
                  </span>
                </div>
              )}
            </div>
          </button>

          {/* Content */}
          {fireAgeChartOpen && (
            hasFireTrend ? (
              <div className="p-4 sm:p-6">
                <FireAgeContextMessage snapshots={fireAgeSnapshots} />
                <FireAgeTrendChart snapshots={resilienceSnapshots} />
              </div>
            ) : (
              <div className="p-6 text-center sm:p-8">
                <Hourglass className="mx-auto mb-2 h-8 w-8 text-horizon-300" />
                <p className="text-sm text-[var(--ink-3)]">
                  Gebruik de app langer om het verloop in je FIRE-leeftijd weer te geven
                </p>
              </div>
            )
          )}
        </div>
      </section>
    </div>
  )
}
