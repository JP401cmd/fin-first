'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Calendar, ArrowUpRight, ArrowDownRight, Clock, Zap, Info, Layers, Banknote, TrendingDown, TrendingUp, Snowflake as SnowflakeIcon } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { LifeEvent } from '@/lib/horizon-data'
import { computeLifeEventNetImpact } from '@/lib/horizon-data'
import { lifeEventsToCashflows, type SimCashflow } from '@/lib/fire-simulation'
import type { FireParams } from '@/lib/fire-params'
import type { Asset } from '@/lib/asset-data'
import { ASSET_TYPE_LABELS } from '@/lib/asset-data'
import { EVENT_ICONS } from '@/components/app/horizon/log-timeline'
import { ArrowRight } from 'lucide-react'

// ── Helpers ──────────────────────────────────────────────────

function formatAge(age: number | null): string {
  if (age == null) return '—'
  return `${age}j`
}

function formatDuration(months: number): string {
  if (months <= 0) return 'Doorlopend'
  if (months < 12) return `${months} mnd`
  const years = Math.floor(months / 12)
  const rem = months % 12
  if (rem === 0) return `${years} jr`
  return `${years}j ${rem}m`
}

// ── Distribution Strategy Types & Logic ──────────────────────

export type DistributionStrategy = 'spreiden' | 'cash_first' | 'laagste_rendement_first'

interface DistributionResult {
  assetId: string
  assetName: string
  assetType: string
  currentValue: number
  expectedReturn: number
  withdrawAmount: number
  remainingValue: number
}

const STRATEGY_INFO: Record<DistributionStrategy, {
  label: string
  icon: typeof Layers
  description: string
  pros: string[]
  cons: string[]
}> = {
  spreiden: {
    label: 'Spreiden',
    icon: Layers,
    description: 'Proportioneel onttrekken uit alle bezittingen naar waarde-aandeel.',
    pros: [
      'Behoudt je asset-allocatie intact',
      'Geen enkele bezitting wordt uitgeput',
      'Risicospreiding blijft behouden',
    ],
    cons: [
      'Onttrekt ook uit hoog-rendement beleggingen',
      'Belastingefficiëntie kan lager zijn',
    ],
  },
  cash_first: {
    label: 'Cash first',
    icon: Banknote,
    description: 'Eerst onttrekken uit bezittingen met het laagste verwacht rendement (typisch cash/spaar).',
    pros: [
      'Hoog-rendement bezittingen blijven langer groeien',
      'Maximaal samengesteld rendement op lange termijn',
    ],
    cons: [
      'Liquiditeitsbuffer kan uitgeput raken',
      'Cash voor noodgevallen kan verdwijnen',
    ],
  },
  laagste_rendement_first: {
    label: 'Laagste rendement first',
    icon: TrendingDown,
    description: 'Onttrekken uit bezitting met het laagste rendement. Als die onvoldoende saldo heeft, doorschuiven naar de volgende.',
    pros: [
      'Optimaal voor rendement-maximalisatie',
      'Minst productieve bezittingen worden eerst benut',
    ],
    cons: [
      'Kan tot concentratierisico leiden',
      'Bezittingen kunnen volledig uitgeput raken',
    ],
  },
}

/**
 * Compute how a withdrawal amount would be distributed across assets
 * given a chosen strategy.
 */
function computeDistribution(
  assets: Asset[],
  amount: number,
  strategy: DistributionStrategy,
): DistributionResult[] {
  if (amount <= 0 || assets.length === 0) return []

  const liquidAssets = assets.filter(a => a.current_value > 0)
  if (liquidAssets.length === 0) return []

  let remaining = amount
  const results: DistributionResult[] = []

  if (strategy === 'spreiden') {
    const totalValue = liquidAssets.reduce((s, a) => s + a.current_value, 0)
    if (totalValue <= 0) return []

    for (const asset of liquidAssets) {
      const share = asset.current_value / totalValue
      const withdraw = Math.min(share * amount, asset.current_value)
      results.push({
        assetId: asset.id,
        assetName: asset.name,
        assetType: asset.asset_type,
        currentValue: asset.current_value,
        expectedReturn: asset.expected_return,
        withdrawAmount: withdraw,
        remainingValue: asset.current_value - withdraw,
      })
    }
  } else {
    // Sort by expected_return ascending for both cash_first and laagste_rendement_first
    const sorted = [...liquidAssets].sort((a, b) => a.expected_return - b.expected_return)

    for (const asset of sorted) {
      if (remaining <= 0) {
        results.push({
          assetId: asset.id,
          assetName: asset.name,
          assetType: asset.asset_type,
          currentValue: asset.current_value,
          expectedReturn: asset.expected_return,
          withdrawAmount: 0,
          remainingValue: asset.current_value,
        })
        continue
      }

      const withdraw = Math.min(remaining, asset.current_value)
      remaining -= withdraw
      results.push({
        assetId: asset.id,
        assetName: asset.name,
        assetType: asset.asset_type,
        currentValue: asset.current_value,
        expectedReturn: asset.expected_return,
        withdrawAmount: withdraw,
        remainingValue: asset.current_value - withdraw,
      })
    }
  }

  return results
}

// ── Income Distribution Strategy Types & Logic ──────────────

export type IncomeDistributionStrategy = 'spreiden' | 'cash_first' | 'hoogste_rendement_first'

interface IncomeDistributionResult {
  assetId: string
  assetName: string
  assetType: string
  currentValue: number
  expectedReturn: number
  depositAmount: number
  newValue: number
}

const INCOME_STRATEGY_INFO: Record<IncomeDistributionStrategy, {
  label: string
  icon: typeof Layers
  description: string
  pros: string[]
  cons: string[]
}> = {
  spreiden: {
    label: 'Spreiden',
    icon: Layers,
    description: 'Proportioneel verdelen over alle bezittingen naar waarde-aandeel, zodat de bestaande allocatie behouden blijft.',
    pros: [
      'Asset-allocatie blijft intact',
      'Risicospreiding wordt behouden',
      'Geen overconcentratie in één bezitting',
    ],
    cons: [
      'Lage-rendement bezittingen groeien mee',
      'Niet optimaal voor rendement-maximalisatie',
    ],
  },
  cash_first: {
    label: 'Cash first',
    icon: Banknote,
    description: 'Eerst storten op bezittingen met het laagste verwacht rendement (cash/spaarrekening). Bouwt liquiditeitsbuffer op.',
    pros: [
      'Liquiditeitsbuffer groeit snel',
      'Zekerheid voor noodgevallen',
      'Laag risico op korte termijn',
    ],
    cons: [
      'Laag rendement op gestort bedrag',
      'Opportunity cost: geld groeit langzamer',
    ],
  },
  hoogste_rendement_first: {
    label: 'Hoogste rendement first',
    icon: TrendingUp,
    description: 'Alles storten op de bezitting met het hoogste verwacht rendement. Maximaal samengesteld rendement op lange termijn.',
    pros: [
      'Maximaal rendement op het gestorte bedrag',
      'Samengesteld effect werkt het hardst',
      'Optimaal voor langetermijngroei',
    ],
    cons: [
      'Concentratierisico neemt toe',
      'Asset-allocatie raakt scheef',
      'Hoger risico bij marktdalingen',
    ],
  },
}

function computeIncomeDistribution(
  assets: Asset[],
  amount: number,
  strategy: IncomeDistributionStrategy,
): IncomeDistributionResult[] {
  if (amount <= 0 || assets.length === 0) return []

  const liquidAssets = assets.filter(a => a.current_value >= 0)
  if (liquidAssets.length === 0) return []

  const results: IncomeDistributionResult[] = []

  if (strategy === 'spreiden') {
    const totalValue = liquidAssets.reduce((s, a) => s + a.current_value, 0)
    if (totalValue <= 0) {
      const share = amount / liquidAssets.length
      for (const asset of liquidAssets) {
        results.push({
          assetId: asset.id,
          assetName: asset.name,
          assetType: asset.asset_type,
          currentValue: asset.current_value,
          expectedReturn: asset.expected_return,
          depositAmount: share,
          newValue: asset.current_value + share,
        })
      }
    } else {
      for (const asset of liquidAssets) {
        const share = asset.current_value / totalValue
        const deposit = share * amount
        results.push({
          assetId: asset.id,
          assetName: asset.name,
          assetType: asset.asset_type,
          currentValue: asset.current_value,
          expectedReturn: asset.expected_return,
          depositAmount: deposit,
          newValue: asset.current_value + deposit,
        })
      }
    }
  } else if (strategy === 'cash_first') {
    const sorted = [...liquidAssets].sort((a, b) => a.expected_return - b.expected_return)
    let remaining = amount
    for (const asset of sorted) {
      const deposit = remaining > 0 ? remaining : 0
      remaining = 0
      results.push({
        assetId: asset.id,
        assetName: asset.name,
        assetType: asset.asset_type,
        currentValue: asset.current_value,
        expectedReturn: asset.expected_return,
        depositAmount: deposit,
        newValue: asset.current_value + deposit,
      })
      if (deposit > 0) break
    }
    for (const asset of sorted) {
      if (!results.find(r => r.assetId === asset.id)) {
        results.push({
          assetId: asset.id,
          assetName: asset.name,
          assetType: asset.asset_type,
          currentValue: asset.current_value,
          expectedReturn: asset.expected_return,
          depositAmount: 0,
          newValue: asset.current_value,
        })
      }
    }
  } else {
    // hoogste_rendement_first
    const sorted = [...liquidAssets].sort((a, b) => b.expected_return - a.expected_return)
    let remaining = amount
    for (const asset of sorted) {
      const deposit = remaining > 0 ? remaining : 0
      remaining = 0
      results.push({
        assetId: asset.id,
        assetName: asset.name,
        assetType: asset.asset_type,
        currentValue: asset.current_value,
        expectedReturn: asset.expected_return,
        depositAmount: deposit,
        newValue: asset.current_value + deposit,
      })
      if (deposit > 0) break
    }
    for (const asset of sorted) {
      if (!results.find(r => r.assetId === asset.id)) {
        results.push({
          assetId: asset.id,
          assetName: asset.name,
          assetType: asset.asset_type,
          currentValue: asset.current_value,
          expectedReturn: asset.expected_return,
          depositAmount: 0,
          newValue: asset.current_value,
        })
      }
    }
  }

  return results
}

// ── Tooltip Component ────────────────────────────────────────

function StrategyTooltip({ strategy }: { strategy: DistributionStrategy }) {
  const [open, setOpen] = useState(false)
  const info = STRATEGY_INFO[strategy]

  return (
    <div className="relative inline-block">
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setOpen(!open) } }}
        className="rounded-full p-0.5 text-[var(--ink-4)] hover:text-[var(--ink-2)] transition-colors cursor-pointer"
        aria-label={`Info over ${info.label}`}
      >
        <Info className="h-3.5 w-3.5" />
      </span>
      {open && (
        <div className="absolute bottom-full left-1/2 z-30 mb-2 w-72 -translate-x-1/2 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-3 shadow-lg">
          <p className="text-xs font-semibold text-[var(--ink)]">{info.label}</p>
          <p className="mt-1 text-[11px] text-[var(--ink-3)]">{info.description}</p>
          <div className="mt-2 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Voordelen</p>
            {info.pros.map((p, i) => (
              <p key={i} className="text-[11px] text-[var(--ink-2)] pl-2 before:content-['✓_'] before:text-emerald-500">
                {p}
              </p>
            ))}
          </div>
          <div className="mt-2 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">Nadelen</p>
            {info.cons.map((c, i) => (
              <p key={i} className="text-[11px] text-[var(--ink-2)] pl-2 before:content-['⚠_'] before:text-amber-500">
                {c}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function IncomeStrategyTooltip({ strategy }: { strategy: IncomeDistributionStrategy }) {
  const [open, setOpen] = useState(false)
  const info = INCOME_STRATEGY_INFO[strategy]

  return (
    <div className="relative inline-block">
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setOpen(!open) } }}
        className="rounded-full p-0.5 text-[var(--ink-4)] hover:text-[var(--ink-2)] transition-colors cursor-pointer"
        aria-label={`Info over ${info.label}`}
      >
        <Info className="h-3.5 w-3.5" />
      </span>
      {open && (
        <div className="absolute bottom-full left-1/2 z-30 mb-2 w-72 -translate-x-1/2 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-3 shadow-lg">
          <p className="text-xs font-semibold text-[var(--ink)]">{info.label}</p>
          <p className="mt-1 text-[11px] text-[var(--ink-3)]">{info.description}</p>
          <div className="mt-2 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Voordelen</p>
            {info.pros.map((p, i) => (
              <p key={i} className="text-[11px] text-[var(--ink-2)] pl-2 before:content-['✓_'] before:text-emerald-500">
                {p}
              </p>
            ))}
          </div>
          <div className="mt-2 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">Nadelen</p>
            {info.cons.map((c, i) => (
              <p key={i} className="text-[11px] text-[var(--ink-2)] pl-2 before:content-['⚠_'] before:text-amber-500">
                {c}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Timeline Component ──────────────────────────────────────

function EventTimelineOverview({
  lifeEvents,
  currentAge,
}: {
  lifeEvents: LifeEvent[]
  currentAge: number | null
}) {
  // Sort events by target_age, null ages go to the end
  const sortedEvents = useMemo(() => {
    return [...lifeEvents]
      .filter((e) => e.target_age != null)
      .sort((a, b) => (a.target_age ?? 999) - (b.target_age ?? 999))
  }, [lifeEvents])

  const eventsWithoutAge = useMemo(() => {
    return lifeEvents.filter((e) => e.target_age == null)
  }, [lifeEvents])

  if (sortedEvents.length === 0 && eventsWithoutAge.length === 0) {
    return null
  }

  // Timeline range
  const minAge = sortedEvents.length > 0 ? (sortedEvents[0].target_age ?? 0) : 0
  const maxAge = sortedEvents.length > 0 ? (sortedEvents[sortedEvents.length - 1].target_age ?? 100) : 100
  const rangeMin = Math.min(currentAge ?? minAge, minAge) - 2
  const rangeMax = Math.max(maxAge, 100) + 2
  const range = rangeMax - rangeMin

  function getPosition(age: number): number {
    return ((age - rangeMin) / range) * 100
  }

  function isRecurring(event: LifeEvent): boolean {
    return event.duration_months > 0 || (event.monthly_cost_change !== 0 || event.monthly_income_change !== 0)
  }

  function getNetMonthly(event: LifeEvent): number {
    return event.monthly_income_change - event.monthly_cost_change
  }

  function formatImpact(event: LifeEvent): string {
    const netImpact = computeLifeEventNetImpact(event)
    // One-time events
    if (event.one_time_cost !== 0 && event.monthly_cost_change === 0 && event.monthly_income_change === 0) {
      const sign = event.one_time_cost > 0 ? '-' : '+'
      return `${sign}${formatCurrency(Math.abs(event.one_time_cost))}`
    }
    // Recurring events
    const monthly = getNetMonthly(event)
    if (monthly !== 0) {
      const sign = monthly > 0 ? '+' : ''
      const suffix = event.duration_months > 0 ? ` voor ${formatDuration(event.duration_months)}` : '/mnd'
      return `${sign}${formatCurrency(monthly)}/mnd${event.duration_months > 0 ? ` × ${formatDuration(event.duration_months)}` : ''}`
    }
    // Fallback
    if (netImpact !== 0) {
      return `${netImpact >= 0 ? '+' : ''}${formatCurrency(netImpact)}`
    }
    return '—'
  }

  function isIncome(event: LifeEvent): boolean {
    const netImpact = computeLifeEventNetImpact(event)
    return netImpact > 0
  }

  return (
    <section data-testid="events-timeline">
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-[var(--border-ed)] px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--paper)]">
          <Calendar className="h-4 w-4 text-horizon-500" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[var(--ink)]">Tijdlijn per leeftijd</h2>
            <span className="rounded-full bg-[var(--paper)] px-2 py-0.5 text-[10px] font-medium text-[var(--ink-3)]">
              {sortedEvents.length}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">Chronologisch overzicht van alle levensgebeurtenissen</p>
        </div>
      </div>

      {/* ── SVG Timeline ── */}
      <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-5 overflow-hidden">
        {/* Timeline axis with events */}
        <div className="relative" style={{ minHeight: `${Math.max(sortedEvents.length * 64 + 60, 200)}px` }}>
          {/* Vertical timeline line */}
          <div className="absolute left-[28px] top-0 bottom-0 w-px bg-[var(--border-ed)]" />

          {/* Current age marker */}
          {currentAge != null && (
            <div
              className="absolute left-0 right-0 flex items-center gap-3"
              style={{ top: `${getPosition(currentAge)}%` }}
            >
              <div className="relative z-10 flex h-[14px] w-[14px] items-center justify-center rounded-full bg-horizon-500 ring-2 ring-horizon-200" style={{ marginLeft: '22px' }}>
                <div className="h-[6px] w-[6px] rounded-full bg-white" />
              </div>
            </div>
          )}

          {/* Event items - vertical list */}
          <div className="space-y-1">
            {sortedEvents.map((event, idx) => {
              const income = isIncome(event)
              const recurring = isRecurring(event)
              const impact = formatImpact(event)
              const isPast = currentAge != null && event.target_age != null && event.target_age < currentAge

              return (
                <div
                  key={event.id}
                  className={`relative flex items-start gap-3 py-2.5 pl-0 ${isPast ? 'opacity-50' : ''}`}
                  data-testid={`timeline-event-${event.id}`}
                >
                  {/* Dot on timeline */}
                  <div className="flex-shrink-0 flex flex-col items-center" style={{ width: '57px' }}>
                    <span className="text-[11px] font-mono font-semibold tabular-nums text-[var(--ink-3)]">
                      {formatAge(event.target_age)}
                    </span>
                  </div>

                  {/* Icon circle */}
                  <div className={`relative z-10 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                    income
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-600'
                      : 'border-red-300 bg-red-50 text-red-600'
                  }`}>
                    {EVENT_ICONS[event.icon] || <span className="text-sm">{event.icon || '📌'}</span>}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-[var(--ink)] truncate max-w-[240px]">
                        {event.name}
                      </span>
                      {/* Type badge */}
                      <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        recurring
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}>
                        {recurring ? (
                          <><Clock className="h-2.5 w-2.5" /> Doorlopend</>
                        ) : (
                          <><Zap className="h-2.5 w-2.5" /> Eenmalig</>
                        )}
                      </span>
                      {/* Inflation icon */}
                      {event.is_indexed && (
                        <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium bg-purple-50 text-purple-700" title="Geïndexeerd met inflatie">
                          <TrendingUp className="h-2.5 w-2.5" /> Geïndexeerd
                        </span>
                      )}
                    </div>
                    {/* Financial impact */}
                    <p className={`mt-0.5 font-mono text-xs font-semibold tabular-nums ${
                      income ? 'text-emerald-600' : 'text-red-600'
                    }`}>
                      {impact}
                    </p>
                  </div>
                </div>
              )
            })}

            {/* Events without target_age */}
            {eventsWithoutAge.length > 0 && (
              <>
                <div className="border-t border-dashed border-[var(--border-md)] my-3" />
                <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--ink-4)] pl-[57px] mb-2">
                  Zonder leeftijd
                </p>
                {eventsWithoutAge.map((event) => {
                  const income = isIncome(event)
                  const impact = formatImpact(event)
                  return (
                    <div
                      key={event.id}
                      className="relative flex items-start gap-3 py-2.5 pl-0 opacity-70"
                      data-testid={`timeline-event-${event.id}`}
                    >
                      <div className="flex-shrink-0 flex flex-col items-center" style={{ width: '57px' }}>
                        <span className="text-[11px] font-mono tabular-nums text-[var(--ink-4)]">—</span>
                      </div>
                      <div className={`relative z-10 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border-2 border-[var(--border-ed)] bg-[var(--subtle)] text-[var(--ink-3)]`}>
                        {EVENT_ICONS[event.icon] || <span className="text-sm">{event.icon || '📌'}</span>}
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <span className="font-semibold text-sm text-[var(--ink)] truncate max-w-[240px]">
                          {event.name}
                        </span>
                        <p className={`mt-0.5 font-mono text-xs font-semibold tabular-nums ${
                          income ? 'text-emerald-600' : 'text-red-600'
                        }`}>
                          {impact}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center gap-4 border-t border-[var(--border-ed)] pt-3 text-[11px] text-[var(--ink-3)]">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full border-2 border-emerald-300 bg-emerald-50" />
            Inkomen / positief
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full border-2 border-red-300 bg-red-50" />
            Uitgave / negatief
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> Doorlopend
          </span>
          <span className="flex items-center gap-1">
            <Zap className="h-3 w-3" /> Eenmalig
          </span>
          <span className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-purple-600" /> Geïndexeerd
          </span>
        </div>
      </div>
    </section>
  )
}

// ── Main Component ───────────────────────────────────────────

export function GebeurtenissenClient({
  lifeEvents,
  assets,
  profile,
  fireParams,
  netWorth,
  annualSavings,
  monthlyExpenses,
}: {
  lifeEvents: LifeEvent[]
  assets: Asset[]
  profile: Record<string, unknown> | null
  fireParams: FireParams
  netWorth: number
  annualSavings: number
  monthlyExpenses: number
}) {
  const [eventsExpanded, setEventsExpanded] = useState(true)
  const [cashflowsExpanded, setCashflowsExpanded] = useState(true)
  const [distributionExpanded, setDistributionExpanded] = useState(true)
  const [incomeDistributionExpanded, setIncomeDistributionExpanded] = useState(true)
  const [selectedStrategy, setSelectedStrategy] = useState<DistributionStrategy>('spreiden')
  const [selectedIncomeStrategy, setSelectedIncomeStrategy] = useState<IncomeDistributionStrategy>('spreiden')

  const dateOfBirth = typeof profile?.date_of_birth === 'string' ? profile.date_of_birth : null
  const currentAge = dateOfBirth
    ? Math.floor((Date.now() - new Date(dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null

  // Convert life events to cashflows
  const cashflows: SimCashflow[] = useMemo(() => {
    return lifeEventsToCashflows(lifeEvents)
  }, [lifeEvents])

  // Net impact per event
  const eventsWithImpact = useMemo(() => {
    return lifeEvents.map((event) => ({
      event,
      netImpact: computeLifeEventNetImpact(event),
    }))
  }, [lifeEvents])

  const totalNetImpact = eventsWithImpact.reduce((sum, e) => sum + e.netImpact, 0)

  // Compute expense events for distribution preview
  const expenseEvents = useMemo(() => {
    return eventsWithImpact.filter(({ event }) => event.one_time_cost > 0)
  }, [eventsWithImpact])

  // Distribution results per expense event
  const distributionResults = useMemo(() => {
    return expenseEvents.map(({ event }) => ({
      event,
      distribution: computeDistribution(assets, event.one_time_cost, selectedStrategy),
    }))
  }, [expenseEvents, assets, selectedStrategy])

  // Compute income events for income distribution preview
  // Income events: negative one_time_cost (incoming money) or positive monthly_income_change
  const incomeEvents = useMemo(() => {
    return eventsWithImpact.filter(({ event }) => {
      // Events that bring in money: negative one_time_cost means incoming lump sum
      return event.one_time_cost < 0 || (event.monthly_income_change > 0 && event.monthly_cost_change === 0)
    })
  }, [eventsWithImpact])

  // Income distribution results per income event
  const incomeDistributionResults = useMemo(() => {
    return incomeEvents.map(({ event }) => {
      // For one-time income: use absolute value of negative one_time_cost
      // For recurring income: use annualized income (monthly_income_change × 12)
      const amount = event.one_time_cost < 0
        ? Math.abs(event.one_time_cost)
        : event.monthly_income_change * 12
      return {
        event,
        amount,
        distribution: computeIncomeDistribution(assets, amount, selectedIncomeStrategy),
      }
    })
  }, [incomeEvents, assets, selectedIncomeStrategy])

  return (
    <div className="space-y-6">
      {/* ── Summary header ── */}
      <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">Actieve gebeurtenissen</p>
            <p className="mt-0.5 font-mono text-xl font-bold tabular-nums text-horizon-600">
              {lifeEvents.length}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">Gegenereerde cashflows</p>
            <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-[var(--ink)]">
              {cashflows.length}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">Netto impact (totaal)</p>
            <p className={`mt-0.5 font-mono text-lg font-bold tabular-nums ${totalNetImpact >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {totalNetImpact >= 0 ? '+' : ''}{formatCurrency(totalNetImpact)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">Huidige leeftijd</p>
            <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-[var(--ink)]">
              {currentAge != null ? `${currentAge}j` : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Timeline Overview ── */}
      <EventTimelineOverview lifeEvents={lifeEvents} currentAge={currentAge} />

      {/* ── Section 1: Active Life Events ── */}
      <section>
        <button
          onClick={() => setEventsExpanded(!eventsExpanded)}
          className="flex w-full items-center gap-3 rounded-xl border border-[var(--border-ed)] px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)]/50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--paper)]">
            <Calendar className="h-4 w-4 text-horizon-500" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-[var(--ink)]">Actieve levensgebeurtenissen</h2>
              <span className="rounded-full bg-[var(--paper)] px-2 py-0.5 text-[10px] font-medium text-[var(--ink-3)]">
                {lifeEvents.length}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">Alle actieve events en hun financiële impact</p>
          </div>
          {eventsExpanded ? <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" /> : <ChevronRight className="h-4 w-4 text-[var(--ink-3)]" />}
        </button>

        {eventsExpanded && (
          <div className="mt-4">
            {lifeEvents.length > 0 ? (
              <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
                <div className="overflow-auto max-h-[70vh]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
                        <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Naam</th>
                        <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Type</th>
                        <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Leeftijd</th>
                        <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Eenmalig</th>
                        <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Mnd. kosten</th>
                        <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Mnd. inkomen</th>
                        <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Duur</th>
                        <th className="px-3 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Index</th>
                        <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Netto impact</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eventsWithImpact.map(({ event, netImpact }, idx) => (
                        <tr
                          key={event.id}
                          className={`border-b border-[var(--border-ed)]/50 ${idx % 2 === 1 ? 'bg-[var(--subtle)]/30' : ''}`}
                        >
                          <td className="px-3 py-1 font-medium text-[var(--ink)]">
                            <div className="flex items-center gap-1.5">
                              <span>{event.icon || '📌'}</span>
                              <span className="truncate max-w-[180px]">{event.name}</span>
                            </div>
                          </td>
                          <td className="px-3 py-1 text-[var(--ink-3)]">
                            <span className="rounded bg-[var(--subtle)] px-1.5 py-0.5 text-[10px] font-medium">
                              {event.event_type}
                            </span>
                          </td>
                          <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                            {formatAge(event.target_age)}
                          </td>
                          <td className={`px-3 py-1 text-right font-mono tabular-nums ${event.one_time_cost !== 0 ? (event.one_time_cost > 0 ? 'text-red-600' : 'text-emerald-600') : 'text-[var(--ink-4)]'}`}>
                            {event.one_time_cost !== 0 ? formatCurrency(event.one_time_cost) : '—'}
                          </td>
                          <td className={`px-3 py-1 text-right font-mono tabular-nums ${event.monthly_cost_change !== 0 ? 'text-red-600' : 'text-[var(--ink-4)]'}`}>
                            {event.monthly_cost_change !== 0 ? formatCurrency(event.monthly_cost_change) : '—'}
                          </td>
                          <td className={`px-3 py-1 text-right font-mono tabular-nums ${event.monthly_income_change > 0 ? 'text-emerald-600' : event.monthly_income_change < 0 ? 'text-red-600' : 'text-[var(--ink-4)]'}`}>
                            {event.monthly_income_change !== 0 ? `${event.monthly_income_change > 0 ? '+' : ''}${formatCurrency(event.monthly_income_change)}` : '—'}
                          </td>
                          <td className="px-3 py-1 text-right text-[var(--ink-2)]">
                            {formatDuration(event.duration_months)}
                          </td>
                          <td className="px-3 py-1 text-center text-[var(--ink-2)]">
                            {event.is_indexed ? '✓' : '—'}
                          </td>
                          <td className={`px-3 py-1 text-right font-mono font-semibold tabular-nums ${netImpact >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {netImpact >= 0 ? '+' : ''}{formatCurrency(netImpact)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-[var(--border-ed)] bg-[var(--subtle)]">
                        <td colSpan={8} className="px-3 py-1.5 font-bold text-[var(--ink)]">Totaal netto impact</td>
                        <td className={`px-3 py-1.5 text-right font-mono font-bold tabular-nums ${totalNetImpact >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {totalNetImpact >= 0 ? '+' : ''}{formatCurrency(totalNetImpact)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/30 px-4 py-8 text-center">
                <Calendar className="mx-auto h-8 w-8 text-[var(--ink-4)]" />
                <p className="mt-2 text-sm font-medium text-[var(--ink-3)]">
                  Geen actieve levensgebeurtenissen gevonden
                </p>
                <p className="mt-1 text-xs text-[var(--ink-4)]">
                  Voeg levensgebeurtenissen toe via <span className="font-medium">De Horizon &rarr; Levensgebeurtenissen</span>.
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Section 2: Generated Cashflows (SimCashflow[]) ── */}
      <section>
        <button
          onClick={() => setCashflowsExpanded(!cashflowsExpanded)}
          className="flex w-full items-center gap-3 rounded-xl border border-[var(--border-ed)] px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)]/50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--paper)]">
            <Zap className="h-4 w-4 text-horizon-500" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-[var(--ink)]">Cashflows (SimCashflow[])</h2>
              <span className="rounded-full bg-[var(--paper)] px-2 py-0.5 text-[10px] font-medium text-[var(--ink-3)]">
                {cashflows.length}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">Gegenereerde flows voor de financiële simulatie</p>
          </div>
          {cashflowsExpanded ? <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" /> : <ChevronRight className="h-4 w-4 text-[var(--ink-3)]" />}
        </button>

        {cashflowsExpanded && (
          <div className="mt-4">
            {/* Info strip */}
            <div className="mb-3 rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)]/50 px-4 py-2.5 text-xs text-[var(--ink-3)]">
              Resultaat van <code className="rounded bg-[var(--subtle)] px-1 py-0.5 font-mono text-[11px]">lifeEventsToCashflows()</code>.
              Deze cashflows worden doorgegeven aan <code className="rounded bg-[var(--subtle)] px-1 py-0.5 font-mono text-[11px]">runSimulation()</code> voor
              de volledige financiële projectie inclusief levensgebeurtenissen.
            </div>

            {cashflows.length > 0 ? (
              <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
                <div className="overflow-auto max-h-[70vh]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
                        <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Naam</th>
                        <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Type</th>
                        <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Richting</th>
                        <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Bedrag</th>
                        <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Van leeftijd</th>
                        <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Tot leeftijd</th>
                        <th className="px-3 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Geïndexeerd</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashflows.map((cf, idx) => (
                        <tr
                          key={cf.id}
                          className={`border-b border-[var(--border-ed)]/50 ${idx % 2 === 1 ? 'bg-[var(--subtle)]/30' : ''}`}
                        >
                          <td className="px-3 py-1 font-medium text-[var(--ink)] truncate max-w-[200px]">
                            {cf.name}
                          </td>
                          <td className="px-3 py-1 text-[var(--ink-2)]">
                            <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              cf.type === 'recurring' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
                            }`}>
                              {cf.type === 'recurring' ? (
                                <><Clock className="h-3 w-3" /> Terugkerend</>
                              ) : (
                                <><Zap className="h-3 w-3" /> Eenmalig</>
                              )}
                            </span>
                          </td>
                          <td className="px-3 py-1 text-[var(--ink-2)]">
                            <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              cf.direction === 'income' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                            }`}>
                              {cf.direction === 'income' ? (
                                <><ArrowUpRight className="h-3 w-3" /> Inkomen</>
                              ) : (
                                <><ArrowDownRight className="h-3 w-3" /> Uitgave</>
                              )}
                            </span>
                          </td>
                          <td className={`px-3 py-1 text-right font-mono font-semibold tabular-nums ${
                            cf.direction === 'income' ? 'text-emerald-600' : 'text-red-600'
                          }`}>
                            {cf.direction === 'income' ? '+' : '-'}{formatCurrency(cf.amount)}
                          </td>
                          <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                            {cf.fromAge}j
                          </td>
                          <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                            {cf.toAge != null ? `${cf.toAge}j` : '∞'}
                          </td>
                          <td className="px-3 py-1 text-center text-[var(--ink-2)]">
                            {cf.indexed ? '✓' : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-[var(--border-ed)] bg-[var(--subtle)]">
                        <td colSpan={3} className="px-3 py-1.5 font-bold text-[var(--ink)]">
                          Totaal: {cashflows.length} cashflows
                        </td>
                        <td colSpan={4} className="px-3 py-1.5 text-right text-xs text-[var(--ink-3)]">
                          {cashflows.filter(c => c.direction === 'income').length} inkomen · {cashflows.filter(c => c.direction === 'expense').length} uitgave · {cashflows.filter(c => c.type === 'recurring').length} terugkerend · {cashflows.filter(c => c.type === 'one_time').length} eenmalig
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/30 px-4 py-8 text-center">
                <Zap className="mx-auto h-8 w-8 text-[var(--ink-4)]" />
                <p className="mt-2 text-sm font-medium text-[var(--ink-3)]">
                  Geen cashflows gegenereerd
                </p>
                <p className="mt-1 text-xs text-[var(--ink-4)]">
                  Voeg levensgebeurtenissen toe om cashflows te genereren.
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Section 3: Distribution Strategy Selection ── */}
      <section>
        <button
          onClick={() => setDistributionExpanded(!distributionExpanded)}
          className="flex w-full items-center gap-3 rounded-xl border border-[var(--border-ed)] px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)]/50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--paper)]">
            <Layers className="h-4 w-4 text-horizon-500" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-[var(--ink)]">Verdelingsstrategie (afname)</h2>
              <span className="rounded-full bg-[var(--paper)] px-2 py-0.5 text-[10px] font-medium text-[var(--ink-3)]">
                {expenseEvents.length}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">Hoe eenmalige kosten worden verdeeld over bezittingen</p>
          </div>
          {distributionExpanded ? <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" /> : <ChevronRight className="h-4 w-4 text-[var(--ink-3)]" />}
        </button>

        {distributionExpanded && (
          <div className="mt-4 space-y-4">
            {/* Strategy picker — card-style with radio indicators */}
            <div className="grid gap-3 sm:grid-cols-3">
              {(Object.keys(STRATEGY_INFO) as DistributionStrategy[]).map((key) => {
                const info = STRATEGY_INFO[key]
                const Icon = info.icon
                const active = selectedStrategy === key
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedStrategy(key)}
                    className={`relative flex flex-col rounded-xl border-2 p-4 text-left transition-all ${
                      active
                        ? 'border-horizon-400 bg-horizon-50/50 shadow-sm'
                        : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-horizon-200 hover:bg-[var(--subtle)]/30'
                    }`}
                  >
                    {/* Radio indicator */}
                    <div className="absolute right-3 top-3">
                      <div className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                        active ? 'border-horizon-500' : 'border-[var(--border-md)]'
                      }`}>
                        {active && <div className="h-2 w-2 rounded-full bg-horizon-500" />}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                        active ? 'bg-horizon-100 text-horizon-600' : 'bg-[var(--subtle)] text-[var(--ink-3)]'
                      }`}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className={`text-xs font-semibold ${active ? 'text-horizon-700' : 'text-[var(--ink)]'}`}>
                        {info.label}
                      </span>
                      <StrategyTooltip strategy={key} />
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-3)]">
                      {info.description}
                    </p>
                  </button>
                )
              })}
            </div>

            {/* Distribution results per expense event */}
            {distributionResults.length > 0 ? (
              distributionResults.map(({ event, distribution }) => (
                <div key={event.id} className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
                  <div className="border-b border-[var(--border-ed)] bg-[var(--subtle)]/50 px-4 py-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>{event.icon || '📌'}</span>
                        <span className="text-sm font-semibold text-[var(--ink)]">{event.name}</span>
                        <span className="rounded bg-[var(--subtle)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--ink-3)]">
                          {event.target_age}j
                        </span>
                      </div>
                      <span className="font-mono text-sm font-semibold tabular-nums text-red-600">
                        -{formatCurrency(event.one_time_cost)}
                      </span>
                    </div>
                  </div>
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
                          <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Bezitting</th>
                          <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Type</th>
                          <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Waarde</th>
                          <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Rendement</th>
                          <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Onttrekking</th>
                          <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Resterend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {distribution.map((row, idx) => (
                          <tr
                            key={row.assetId}
                            className={`border-b border-[var(--border-ed)]/50 ${idx % 2 === 1 ? 'bg-[var(--subtle)]/30' : ''}`}
                          >
                            <td className="px-3 py-1 font-medium text-[var(--ink)]">{row.assetName}</td>
                            <td className="px-3 py-1 text-[var(--ink-3)]">
                              <span className="rounded bg-[var(--subtle)] px-1.5 py-0.5 text-[10px] font-medium">
                                {ASSET_TYPE_LABELS[row.assetType as keyof typeof ASSET_TYPE_LABELS] ?? row.assetType}
                              </span>
                            </td>
                            <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                              {formatCurrency(row.currentValue)}
                            </td>
                            <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink-2)]">
                              {row.expectedReturn.toFixed(1)}%
                            </td>
                            <td className={`px-3 py-1 text-right font-mono font-semibold tabular-nums ${row.withdrawAmount > 0 ? 'text-red-600' : 'text-[var(--ink-4)]'}`}>
                              {row.withdrawAmount > 0 ? `-${formatCurrency(row.withdrawAmount)}` : '—'}
                            </td>
                            <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                              {formatCurrency(row.remainingValue)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/30 px-4 py-6 text-center">
                <Layers className="mx-auto h-6 w-6 text-[var(--ink-4)]" />
                <p className="mt-2 text-sm text-[var(--ink-3)]">
                  Geen eenmalige kosten gevonden — verdelingsstrategie niet van toepassing.
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Section 3b: Income Distribution Strategy ── */}
      <section data-testid="income-distribution-section">
        <button
          onClick={() => setIncomeDistributionExpanded(!incomeDistributionExpanded)}
          className="flex w-full items-center gap-3 rounded-xl border border-[var(--border-ed)] px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)]/50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--paper)]">
            <ArrowUpRight className="h-4 w-4 text-emerald-500" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-[var(--ink)]">Verdelingsstrategie voor toename</h2>
              <span className="rounded-full bg-[var(--paper)] px-2 py-0.5 text-[10px] font-medium text-[var(--ink-3)]">
                {incomeEvents.length}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">Hoe binnenkomend geld wordt verdeeld over bezittingen</p>
          </div>
          {incomeDistributionExpanded ? <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" /> : <ChevronRight className="h-4 w-4 text-[var(--ink-3)]" />}
        </button>

        {incomeDistributionExpanded && (
          <div className="mt-4 space-y-4">
            {/* Strategy picker — card-style with radio indicators */}
            <div className="grid gap-3 sm:grid-cols-3">
              {(Object.keys(INCOME_STRATEGY_INFO) as IncomeDistributionStrategy[]).map((key) => {
                const info = INCOME_STRATEGY_INFO[key]
                const Icon = info.icon
                const active = selectedIncomeStrategy === key
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedIncomeStrategy(key)}
                    className={`relative flex flex-col rounded-xl border-2 p-4 text-left transition-all ${
                      active
                        ? 'border-emerald-400 bg-emerald-50/50 shadow-sm'
                        : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-emerald-200 hover:bg-[var(--subtle)]/30'
                    }`}
                    data-testid={`income-strategy-${key}`}
                  >
                    {/* Radio indicator */}
                    <div className="absolute right-3 top-3">
                      <div className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                        active ? 'border-emerald-500' : 'border-[var(--border-md)]'
                      }`}>
                        {active && <div className="h-2 w-2 rounded-full bg-emerald-500" />}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                        active ? 'bg-emerald-100 text-emerald-600' : 'bg-[var(--subtle)] text-[var(--ink-3)]'
                      }`}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className={`text-xs font-semibold ${active ? 'text-emerald-700' : 'text-[var(--ink)]'}`}>
                        {info.label}
                      </span>
                      <IncomeStrategyTooltip strategy={key} />
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-3)]">
                      {info.description}
                    </p>
                  </button>
                )
              })}
            </div>

            {/* Income distribution results per income event */}
            {incomeDistributionResults.length > 0 ? (
              incomeDistributionResults.map(({ event, amount, distribution }) => (
                <div key={event.id} className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
                  <div className="border-b border-[var(--border-ed)] bg-emerald-50/50 px-4 py-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>{event.icon || '📌'}</span>
                        <span className="text-sm font-semibold text-[var(--ink)]">{event.name}</span>
                        {event.target_age != null && (
                          <span className="rounded bg-[var(--subtle)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--ink-3)]">
                            {event.target_age}j
                          </span>
                        )}
                        <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          event.one_time_cost < 0 ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
                        }`}>
                          {event.one_time_cost < 0 ? 'Eenmalig' : 'Jaarlijks inkomen'}
                        </span>
                      </div>
                      <span className="font-mono text-sm font-semibold tabular-nums text-emerald-600">
                        +{formatCurrency(amount)}
                      </span>
                    </div>
                  </div>
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
                          <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Bezitting</th>
                          <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Type</th>
                          <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Huidige waarde</th>
                          <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Rendement</th>
                          <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Storting</th>
                          <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Nieuwe waarde</th>
                        </tr>
                      </thead>
                      <tbody>
                        {distribution.map((row, idx) => (
                          <tr
                            key={row.assetId}
                            className={`border-b border-[var(--border-ed)]/50 ${idx % 2 === 1 ? 'bg-[var(--subtle)]/30' : ''}`}
                          >
                            <td className="px-3 py-1 font-medium text-[var(--ink)]">{row.assetName}</td>
                            <td className="px-3 py-1 text-[var(--ink-3)]">
                              <span className="rounded bg-[var(--subtle)] px-1.5 py-0.5 text-[10px] font-medium">
                                {ASSET_TYPE_LABELS[row.assetType as keyof typeof ASSET_TYPE_LABELS] ?? row.assetType}
                              </span>
                            </td>
                            <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                              {formatCurrency(row.currentValue)}
                            </td>
                            <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink-2)]">
                              {row.expectedReturn.toFixed(1)}%
                            </td>
                            <td className={`px-3 py-1 text-right font-mono font-semibold tabular-nums ${row.depositAmount > 0 ? 'text-emerald-600' : 'text-[var(--ink-4)]'}`}>
                              {row.depositAmount > 0 ? `+${formatCurrency(row.depositAmount)}` : '—'}
                            </td>
                            <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                              {formatCurrency(row.newValue)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/30 px-4 py-6 text-center">
                <ArrowUpRight className="mx-auto h-6 w-6 text-[var(--ink-4)]" />
                <p className="mt-2 text-sm text-[var(--ink-3)]">
                  Geen toename-gebeurtenissen gevonden — verdelingsstrategie niet van toepassing.
                </p>
                <p className="mt-1 text-xs text-[var(--ink-4)]">
                  Voeg gebeurtenissen toe met inkomsten (erfenis, verkoop, bijverdienste) om verdelingen te berekenen.
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Section 4: Impact Preview ── */}
      <section>
        <div className="flex items-center gap-3 rounded-xl border border-[var(--border-ed)] px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--paper)]">
            <SnowflakeIcon className="h-4 w-4 text-horizon-500" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-[var(--ink)]">Impact preview</h2>
            <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">Samenvatting van de financiële impact op je pad naar vrijheid</p>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)]/30 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">Huidig netto vermogen</p>
              <p className="mt-1 font-mono text-base font-semibold tabular-nums text-[var(--ink)]">
                {formatCurrency(netWorth)}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)]/30 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">Na alle gebeurtenissen</p>
              <p className={`mt-1 font-mono text-base font-semibold tabular-nums ${
                totalNetImpact >= 0 ? 'text-emerald-600' : 'text-red-600'
              }`}>
                {formatCurrency(netWorth + totalNetImpact)}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)]/30 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">Verschil</p>
              <p className={`mt-1 font-mono text-base font-semibold tabular-nums ${
                totalNetImpact >= 0 ? 'text-emerald-600' : 'text-red-600'
              }`}>
                {totalNetImpact >= 0 ? '+' : ''}{formatCurrency(totalNetImpact)}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)]/30 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">Jaarlijkse spaarcapaciteit</p>
              <p className="mt-1 font-mono text-base font-semibold tabular-nums text-[var(--ink)]">
                {formatCurrency(annualSavings)}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)]/30 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">Impact in spaartijd</p>
              <p className={`mt-1 font-mono text-base font-semibold tabular-nums ${
                totalNetImpact >= 0 ? 'text-emerald-600' : 'text-red-600'
              }`}>
                {annualSavings > 0
                  ? `${totalNetImpact >= 0 ? '+' : ''}${(totalNetImpact / annualSavings).toFixed(1)} jaar`
                  : '—'
                }
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)]/30 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">Maandelijkse uitgaven (ref.)</p>
              <p className="mt-1 font-mono text-base font-semibold tabular-nums text-[var(--ink)]">
                {formatCurrency(monthlyExpenses)}
              </p>
            </div>
          </div>

          {/* ── Impact preview table ── */}
          {eventsWithImpact.length > 0 && (
            <div className="mt-5 border-t border-[var(--border-ed)] pt-4" data-testid="impact-preview-table">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                Impact per gebeurtenis
              </p>
              <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
                <div className="overflow-auto max-h-[70vh]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
                        <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Gebeurtenis</th>
                        <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Leeftijd</th>
                        <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Eenmalig</th>
                        <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Maandelijks</th>
                        <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Duur</th>
                        <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Totale impact</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eventsWithImpact.map(({ event, netImpact }, idx) => {
                        // Net monthly = income change minus cost change
                        const netMonthly = event.monthly_income_change - event.monthly_cost_change
                        // One-time cost (negative = expense)
                        const oneTime = event.one_time_cost !== 0 ? -event.one_time_cost : 0
                        return (
                          <tr
                            key={event.id}
                            className={`border-b border-[var(--border-ed)]/50 ${idx % 2 === 1 ? 'bg-[var(--subtle)]/30' : ''}`}
                          >
                            <td className="px-3 py-1 font-medium text-[var(--ink)]">
                              <div className="flex items-center gap-1.5">
                                <span>{event.icon || '📌'}</span>
                                <span className="truncate max-w-[200px]">{event.name}</span>
                              </div>
                            </td>
                            <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                              {formatAge(event.target_age)}
                            </td>
                            <td className={`px-3 py-1 text-right font-mono tabular-nums ${oneTime !== 0 ? (oneTime > 0 ? 'text-emerald-600' : 'text-red-600') : 'text-[var(--ink-4)]'}`}>
                              {oneTime !== 0 ? `${oneTime > 0 ? '+' : ''}${formatCurrency(oneTime)}` : '—'}
                            </td>
                            <td className={`px-3 py-1 text-right font-mono tabular-nums ${netMonthly !== 0 ? (netMonthly > 0 ? 'text-emerald-600' : 'text-red-600') : 'text-[var(--ink-4)]'}`}>
                              {netMonthly !== 0 ? `${netMonthly > 0 ? '+' : ''}${formatCurrency(netMonthly)}/mnd` : '—'}
                            </td>
                            <td className="px-3 py-1 text-right text-[var(--ink-2)]">
                              {formatDuration(event.duration_months)}
                            </td>
                            <td className={`px-3 py-1 text-right font-mono font-semibold tabular-nums ${netImpact >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {netImpact >= 0 ? '+' : ''}{formatCurrency(netImpact)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-[var(--border-ed)] bg-[var(--subtle)]">
                        <td colSpan={5} className="px-3 py-1.5 font-bold text-[var(--ink)]">Totaal netto impact</td>
                        <td className={`px-3 py-1.5 text-right font-mono font-bold tabular-nums ${totalNetImpact >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {totalNetImpact >= 0 ? '+' : ''}{formatCurrency(totalNetImpact)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Events impact breakdown bar chart */}
          {eventsWithImpact.length > 0 && (
            <div className="mt-5 border-t border-[var(--border-ed)] pt-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                Visueel overzicht
              </p>
              <div className="space-y-2">
                {[...eventsWithImpact]
                  .sort((a, b) => Math.abs(b.netImpact) - Math.abs(a.netImpact))
                  .map(({ event, netImpact }) => {
                    const maxImpact = Math.max(...eventsWithImpact.map(e => Math.abs(e.netImpact)), 1)
                    const barWidth = Math.max(2, (Math.abs(netImpact) / maxImpact) * 100)
                    return (
                      <div key={event.id} className="flex items-center gap-3">
                        <span className="w-5 shrink-0 text-center">{event.icon || '📌'}</span>
                        <span className="w-[140px] shrink-0 truncate text-xs text-[var(--ink-2)]">
                          {event.name}
                        </span>
                        <div className="flex-1">
                          <div
                            className={`h-3 rounded ${
                              netImpact >= 0 ? 'bg-emerald-400/60' : 'bg-red-400/60'
                            }`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <span className={`w-[90px] shrink-0 text-right font-mono text-xs font-semibold tabular-nums ${
                          netImpact >= 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}>
                          {netImpact >= 0 ? '+' : ''}{formatCurrency(netImpact)}
                        </span>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
