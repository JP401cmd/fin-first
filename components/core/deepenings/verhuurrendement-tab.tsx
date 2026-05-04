'use client'

/**
 * Verhuurrendement-tab — orchestreert de complete app voor één of meer
 * verhuurd vastgoed-objecten van de gebruiker.
 *
 * Entry-point: `/core/assets/real_estate?tab=verhuurrendement`. We laden alle
 * actieve `real_estate`-assets met `has_rental_tracking === true`, plus alle
 * gekoppelde mortgages (via `linked_asset_id`), zodat we per object een
 * complete cashflow- en rendements-doorrekening kunnen tonen.
 *
 * Lay-out (top-down):
 *  1. Header — kicker + titel + samenvatting
 *  2. Per object: <RentalROICard>    — cashflow-breakdown + ROI-strip
 *  3. <Box3Comparison>               — gedeeld over één gekozen object
 *  4. <CashflowChart>                — 12-mnd lijngrafiek (eerste object)
 *  5. <VacancyTimeline>              — bezetting (eerste object)
 *  6. <WaardestijgingSlider>         — gedeeld; speelt mee met Box 3 werkelijk
 *  7. <RentalAlternativeComparison>  — vastgoed vs aandelen vs spaar
 *
 * Multi-object-strategie: bij meerdere getrackte panden tonen we ROI-cards
 * voor elk pand, maar de aanvullende secties (Box 3, cashflow-chart,
 * vacancy-timeline) zijn per definitie context-bound aan één object. We
 * tonen die voor het eerste pand én een korte uitleg dat de gebruiker via
 * de detail-modal van een ander pand kan switchen. Een per-object accordion
 * zou de tab te zwaar maken; één primaire focus is leesbaarder.
 *
 * Module-uit pad: bij `vermogensregistratie`-module uit zien we direct de
 * teaser-component met tip-strip naar Instellingen.
 */

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Building2 } from 'lucide-react'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import type { DeepeningTabProps } from '../category-deepening-registry'
import { ModuleTipStrip } from '../module-tip-strip'
import { WaardestijgingSlider } from './hypotheekplanner/waardestijging-slider'
import { RentalROICard } from './verhuurrendement/rental-roi-card'
import { Box3Comparison } from './verhuurrendement/box3-comparison'
import { CashflowChart } from './verhuurrendement/cashflow-chart'
import { VacancyTimeline } from './verhuurrendement/vacancy-timeline'
import { RentalAlternativeComparison } from './verhuurrendement/rental-alternative-comparison'
import { calculateRental, type RentalCalculation } from './verhuurrendement/calc'

// ── Top-level entry ──────────────────────────────────────────

export function VerhuurrendementTab({ moduleActive }: DeepeningTabProps) {
  if (!moduleActive) {
    return <VerhuurrendementTeaser />
  }
  return <VerhuurrendementActive />
}

// ── Teaser (module uit) ──────────────────────────────────────

function VerhuurrendementTeaser() {
  return (
    <div className="space-y-6">
      <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-6 py-8">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Module uit
        </p>
        <h3 className="mt-2 font-serif text-xl font-semibold text-[var(--ink)]">
          Vermogensregistratie is niet ingeschakeld
        </h3>
        <p className="mt-2 font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
          Met Vermogensregistratie kun je per verhuurd pand de cashflow,
          netto-rendement en bezetting volgen — inclusief een transparante
          Box 3-vergelijking tussen forfaitair en werkelijk. Schakel het in
          via Instellingen om hier inzicht te krijgen.
        </p>
      </div>
      <ModuleTipStrip
        copy="Activeer Vermogensregistratie om netto rendement, cashflow en bezetting per object te zien."
        className="border-t-0"
      />
    </div>
  )
}

// ── Active tab ───────────────────────────────────────────────

interface LoadedData {
  assets: Asset[]
  /** Alle mortgages, lookup via `linked_asset_id`. */
  mortgages: Debt[]
  error: string | null
}

function VerhuurrendementActive() {
  const { masked } = useMaskedAmounts()
  const fc = (v: number) => formatMaskedCurrency(v, masked)
  const [data, setData] = useState<LoadedData | null>(null)

  // Slider-state — gedeeld voor alle objecten op deze pagina (de slider zelf
  // bepaalt zijn default 2,5%). Door state hier te houden kunnen we de
  // werkelijk-Box-3 berekening live laten reageren.
  const [growthRate, setGrowthRate] = useState(2.5)

  useEffect(() => {
    let aborted = false
    void (async () => {
      try {
        const supabase = createClient()
        const [assetsRes, debtsRes] = await Promise.all([
          supabase
            .from('assets')
            .select('*')
            .eq('asset_type', 'real_estate')
            .eq('is_active', true)
            .eq('has_rental_tracking', true)
            .order('current_value', { ascending: false }),
          supabase
            .from('debts')
            .select('*')
            .eq('debt_type', 'mortgage')
            .eq('is_active', true),
        ])
        if (aborted) return
        if (assetsRes.error) throw assetsRes.error
        if (debtsRes.error) throw debtsRes.error
        setData({
          assets: (assetsRes.data ?? []) as Asset[],
          mortgages: (debtsRes.data ?? []) as Debt[],
          error: null,
        })
      } catch (err) {
        if (aborted) return
        setData({
          assets: [],
          mortgages: [],
          error: err instanceof Error ? err.message : 'Onbekende fout',
        })
      }
    })()
    return () => {
      aborted = true
    }
  }, [])

  // Build per-asset calculations. We rekenen alle objecten in één useMemo
  // door zodat hot updates op `growthRate` één enkele recalculation
  // triggeren. Mortgage-lookup gebeurt per asset via `linked_asset_id`.
  const calcs = useMemo<Array<{ asset: Asset; mortgage: Debt | null; calc: RentalCalculation }>>(() => {
    if (!data?.assets) return []
    return data.assets.map((asset) => {
      const mortgage =
        data.mortgages.find((m) => m.linked_asset_id === asset.id) ?? null
      return {
        asset,
        mortgage,
        calc: calculateRental(asset, mortgage, growthRate),
      }
    })
  }, [data, growthRate])

  if (data === null) return <SkeletonBox />
  if (data.error !== null) return <ErrorBox detail={data.error} />
  if (calcs.length === 0) return <NoTrackedItemsState />

  // Het primaire object voor secties die per definitie één pand tonen
  // (Box 3-vergelijking, cashflow-chart, vacancy-timeline). Voorlopig altijd
  // het eerste object — bij multi-object zou een dropdown beter zijn, maar
  // dat valt buiten de huidige scope.
  const primary = calcs[0]
  const totalMonthlyCashflow = calcs.reduce((sum, c) => sum + c.calc.monthlyNetCashflow, 0)
  const totalCurrentValue = calcs.reduce((sum, c) => sum + c.calc.currentValue, 0)
  const totalOwnEquity = calcs.reduce((sum, c) => sum + c.calc.ownEquity, 0)

  return (
    <div className="space-y-8">
      {/* ── Header — kicker + titel + samenvatting ───────────── */}
      <header>
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Verhuurrendement
        </p>
        <h2
          className="mt-1 font-serif text-xl font-semibold text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-playfair, serif)' }}
        >
          {calcs.length === 1
            ? 'Eén verhuurd pand in beeld'
            : `${calcs.length} verhuurde panden in beeld`}
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
          <Stat
            label="Marktwaarde totaal"
            value={fc(totalCurrentValue)}
          />
          <Stat
            label="Eigen geld"
            value={fc(totalOwnEquity)}
            tone="primary"
          />
          <Stat
            label="Cashflow per maand"
            value={`${totalMonthlyCashflow >= 0 ? '+' : '−'}${fc(Math.abs(totalMonthlyCashflow))}`}
            tone={totalMonthlyCashflow >= 0 ? 'positive' : 'negative'}
          />
          <Stat
            label="Cashflow per jaar"
            value={`${totalMonthlyCashflow >= 0 ? '+' : '−'}${fc(Math.abs(totalMonthlyCashflow * 12))}`}
            tone={totalMonthlyCashflow >= 0 ? 'positive' : 'negative'}
          />
        </div>
      </header>

      {/* ── Per pand: ROI-card ─────────────────────────────────── */}
      <section className="space-y-3">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Cashflow per object
        </p>
        <div className="space-y-4">
          {calcs.map(({ asset, calc }) => (
            <RentalROICard key={asset.id} asset={asset} calc={calc} />
          ))}
        </div>
      </section>

      {/* ── Multi-object noot ──────────────────────────────────── */}
      {calcs.length > 1 && (
        <p className="border-l-2 border-kern-300 bg-[var(--subtle)]/40 px-3 py-2 text-[11px] leading-relaxed text-[var(--ink-2)]">
          De vergelijkingen hieronder tonen{' '}
          <span className="font-medium text-[var(--ink)]">{primary.asset.name}</span>.
          Wil je een ander pand vergelijken? Pas de focus aan via de detail van dat pand.
        </p>
      )}

      {/* ── Box 3-vergelijking (forfaitair vs werkelijk) ─────── */}
      <Box3Comparison calc={primary.calc} />

      {/* ── Waardestijging-slider — voedt de werkelijk-rekening ─ */}
      <WaardestijgingSlider
        marketValue={primary.calc.currentValue}
        initialValue={growthRate}
        onChange={setGrowthRate}
      />

      {/* ── Cashflow-chart (12 mnd) ──────────────────────────── */}
      <CashflowChart
        calc={primary.calc}
        vacancyLog={primary.asset.vacancy_log ?? []}
      />

      {/* ── Vacancy-timeline ──────────────────────────────────── */}
      <VacancyTimeline vacancyLog={primary.asset.vacancy_log ?? []} />

      {/* ── Vergelijking met alternatieven ──────────────────── */}
      <RentalAlternativeComparison calc={primary.calc} />
    </div>
  )
}

// ── Header stat ──────────────────────────────────────────────

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'primary' | 'negative' | 'positive'
}) {
  const valueClass =
    tone === 'primary'
      ? 'text-[var(--ink)]'
      : tone === 'negative'
        ? 'text-negative'
        : tone === 'positive'
          ? 'text-positive'
          : 'text-[var(--ink-2)]'
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
        {label}
      </p>
      <p
        className={`mt-0.5 font-mono tabular-nums text-sm font-semibold ${valueClass}`}
      >
        {value}
      </p>
    </div>
  )
}

// ── Empty / loading / error states ───────────────────────────

function NoTrackedItemsState() {
  return (
    <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-6 py-8 text-center">
      <Building2 className="mx-auto h-6 w-6 text-[var(--ink-4)]" aria-hidden="true" />
      <p className="mt-2 text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
        Nog niets getrackt
      </p>
      <p className="mt-2 font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
        Activeer verhuur-tracking op een vastgoed-object om hier de
        cashflow-, rendements- en bezetting-inzichten te zien.
      </p>
    </div>
  )
}

function SkeletonBox() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <div className="h-2.5 w-32 animate-pulse bg-[var(--subtle)]" />
        <div className="h-5 w-48 animate-pulse bg-[var(--subtle)]" />
        <div className="h-3 w-full max-w-md animate-pulse bg-[var(--subtle)]" />
      </div>
      <div className="h-[140px] animate-pulse bg-[var(--paper)] border border-[var(--border-ed)]" />
      <div className="h-[100px] animate-pulse bg-[var(--paper)] border border-[var(--border-ed)]" />
      <div className="h-[200px] animate-pulse bg-[var(--paper)] border border-[var(--border-ed)]" />
      <span className="sr-only">Verhuurrendement wordt geladen…</span>
    </div>
  )
}

function ErrorBox({ detail }: { detail: string }) {
  return (
    <div
      role="alert"
      className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-6 py-8"
    >
      <p className="text-[10px] uppercase tracking-[0.08em] text-negative">
        Verhuurpanden niet geladen
      </p>
      <p className="mt-2 font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
        We konden de gegevens niet ophalen. Probeer de pagina te verversen — als
        het probleem blijft, controleer je internetverbinding.
      </p>
      <p className="mt-3 font-mono text-[11px] leading-snug text-[var(--ink-4)]">
        {detail}
      </p>
      <button
        type="button"
        onClick={() => {
          if (typeof window !== 'undefined') window.location.reload()
        }}
        className="mt-4 inline-flex h-11 items-center gap-2 border border-kern-300 bg-kern-50 px-4 text-sm font-medium text-kern-700 transition-colors hover:bg-kern-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        Opnieuw proberen
      </button>
    </div>
  )
}
