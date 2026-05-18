'use client'

import { useMemo, useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Settings, TrendingUp, ArrowDownRight, ArrowUpRight, ListOrdered, Shuffle, Target, ExternalLink, ChevronRight } from 'lucide-react'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'

/** Masked-aware EUR formatter hook used across this file's sub-views. */
function useFc() {
  const { masked } = useMaskedAmounts()
  return useCallback((v: number) => formatMaskedCurrency(v, masked), [masked])
}
import type { FireParams } from '@/lib/fire-params'
import type { LifeEvent } from '@/lib/horizon-data'
import { NL_SWR, BOX3_TARIEF, NL_FICTIEF_BELEGGINGEN } from '@/lib/horizon-data'
import { type SimCashflow } from '@/lib/fire-simulation'
import { type FireEndStrategy, STRATEGY_LABELS } from '@/lib/fire-strategy'
import { computeRetirementExpenses, type RetirementExpenseMethod } from '@/lib/budget-utils'
import { type ModuleId, isModuleActive } from '@/lib/module-registry'
import type { Asset as LibAsset } from '@/lib/asset-data'
import type { Debt as LibDebt } from '@/lib/debt-data'
import {
  useDoorrekeningSettings,
  type WithdrawalStrategy,
  type DistributionStrategy,
  type OutflowDistribution,
  type WithdrawalOrder,
} from '../settings-context'
import {
  computeOpbouwComposition,
  type CompositionView,
} from '../calc/opbouw-composition'
import type {
  AfbouwDistributionStrategy,
  WithdrawalStrategy as AfbouwWithdrawalStrategy,
} from '../calc/afbouw-projection'
import { computeHybridProjection } from '../calc/hybrid-projection'
import { DoorrekeningChart, type ChartMode, type DoorrekeningEndStrategy } from './doorrekening-chart'
import { OpbouwCompositionChart } from './opbouw-composition-chart'
import { YearDetailsSheet } from './year-details-sheet'
import { HybridTimelineTable } from './hybrid-timeline-table'
import { useDoorrekeningSim } from '../use-doorrekening-sim'

const WITHDRAWAL_STRATEGIES: { key: WithdrawalStrategy; name: string; desc: string; detail: string }[] = [
  {
    key: 'swr',
    name: 'Vast (SWR)',
    desc: 'Vaste jaarlijkse onttrekking',
    detail: `${(NL_SWR * 100).toFixed(2)}% van je portfolio per jaar — stabiel en voorspelbaar`,
  },
  {
    key: 'guardrails',
    name: 'Guardrails',
    desc: 'Variabel met grenzen',
    detail: 'Flexibele onttrekking met vloer- en plafondgrenzen (±20%)',
  },
  {
    key: 'vpw',
    name: 'VPW',
    desc: 'Variabel per leeftijd',
    detail: 'Onttrekking op basis van resterende levensverwachting — hoger naarmate je ouder wordt',
  },
  {
    key: 'bucket',
    name: 'Bucket',
    desc: '3-emmers strategie',
    detail: 'Cash (2j), obligaties (5j), aandelen — vermindert volgorderisico',
  },
]

// ── End Strategy Descriptions (for overzicht UI) ─────────────

const END_STRATEGY_OPTIONS: { key: FireEndStrategy; icon: string; color: string }[] = [
  { key: 'perpetual', icon: '∞', color: 'horizon' },
  { key: 'legacy', icon: '🏛', color: 'horizon' },
  { key: 'deplete', icon: '📉', color: 'horizon' },
  { key: 'pensioen', icon: '🧓', color: 'horizon' },
]

// ── Distribution Strategy Types ───────────────────────────────
//
// Distribution/outflow/withdrawal-order zijn asset-level allocatie-instellingen.
// De gedeelde `runSimulation`-engine werkt op totaal-portfolio niveau en
// gebruikt deze keuzes (nog) niet. Ze blijven in de UI aanwezig zodat Fase C/D
// ze later via Context kan doorgeven aan per-asset decompositie.

const DISTRIBUTION_STRATEGIES: { key: DistributionStrategy; name: string; desc: string; when: string }[] = [
  {
    key: 'proportional',
    name: 'Spreiden',
    desc: 'Proportioneel uit alle bezittingen naar waarde-aandeel',
    when: 'Goed als je je portefeuille in balans wilt houden',
  },
  {
    key: 'cash_first',
    name: 'Cash first',
    desc: 'Eerst uit bezitting met laagste verwacht rendement',
    when: 'Slim als je renderende bezittingen wilt laten groeien',
  },
  {
    key: 'lowest_return',
    name: 'Laagste rendement first',
    desc: 'Uit laagste rendement bezitting, doorschuiven als leeg',
    when: 'Maximaal rendement behouden op de langere termijn',
  },
  {
    key: 'highest_return',
    name: 'Hoogste rendement first',
    desc: 'Eerst naar bezitting met hoogste verwacht rendement',
    when: 'Agressief — maximaliseert samengestelde groei op instromend geld',
  },
]

const OUTFLOW_DISTRIBUTIONS: { key: OutflowDistribution; name: string; desc: string; when: string }[] = [
  {
    key: 'proportional',
    name: 'Spreiden',
    desc: 'Proportioneel uit alle bezittingen naar waarde-aandeel',
    when: 'Goed als je je portefeuille in balans wilt houden',
  },
  {
    key: 'cash_first',
    name: 'Cash first',
    desc: 'Eerst uit bezitting met laagste verwacht rendement',
    when: 'Slim als je renderende bezittingen wilt laten groeien',
  },
  {
    key: 'lowest_return_first',
    name: 'Laagste rendement first',
    desc: 'Uit laagste rendement bezitting, doorschuiven als leeg',
    when: 'Maximaal rendement behouden op de langere termijn',
  },
]

const WITHDRAWAL_ORDERS: { key: WithdrawalOrder; name: string; desc: string; when: string }[] = [
  {
    key: 'cash_first',
    name: 'Cash first',
    desc: 'Eerst spaar-/cashrekeningen, dan laag rendement, dan hoog rendement',
    when: 'Beschermt groei-bezittingen zo lang mogelijk',
  },
  {
    key: 'low_return_first',
    name: 'Laag rendement first',
    desc: 'Eerst bezitting met laagste verwacht rendement, oplopend',
    when: 'Maximaal rendement op resterende portefeuille',
  },
  {
    key: 'own_home_last',
    name: 'Eigen huis laatst',
    desc: 'Alle liquide bezittingen eerst, vastgoed/huis als allerlaatste',
    when: 'Woonzekerheid behouden tot het uiterste',
  },
  {
    key: 'pro_rata',
    name: 'Pro rata (spreiden)',
    desc: 'Proportioneel uit alle bezittingen',
    when: 'Portefeuille-balans behouden tijdens afbouw',
  },
  {
    key: 'highest_value_first',
    name: 'Hoogste waarde first',
    desc: 'Eerst uit grootste positie, dan aflopend',
    when: 'Sneller naar een meer gebalanceerde portefeuille',
  },
]

// ── Uitgangspunten Row ─────────────────────────────────────────

/**
 * Read-only row in het Uitgangspunten-panel. Toont label + waarde en optioneel
 * een klikbare bron (profiel / instellingen / budgetten / gebeurtenissen).
 */
function UitgangspuntRow({
  label,
  value,
  suffix,
  href,
  sourceLabel,
}: {
  label: string
  value: string
  /** Klein toelichtingslabel achter of onder de waarde, bv. "(6mnd gemiddelde)" */
  suffix?: string
  /** Link naar de bron van deze waarde */
  href?: string
  /** Tekst van de bronlink, bv. "profiel" of "instellingen" */
  sourceLabel?: string
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
        {value}
      </dd>
      {(suffix || href) && (
        <p className="mt-0.5 text-[10px] text-[var(--ink-3)]">
          {suffix && <span>{suffix}</span>}
          {suffix && href && <span> · </span>}
          {href && sourceLabel && (
            <Link
              href={href}
              className="inline-flex items-center gap-0.5 hover:underline hover:text-[var(--ink-2)]"
            >
              {sourceLabel}
              <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
            </Link>
          )}
        </p>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────

export function OverzichtClient({
  assets,
  debts,
  profile,
  fireParams,
  netWorth,
  yearlyMustExpenses,
  lifeEvents,
  cashflows,
  userAowAge,
  weightedGrossReturn,
  savingsRate6m,
  estimatedYearlyIncome,
}: {
  assets: LibAsset[]
  debts: LibDebt[]
  profile: Record<string, unknown> | null
  fireParams: FireParams
  netWorth: number
  totalAssets: number
  totalDebts: number
  yearlyMustExpenses: number
  lifeEvents: LifeEvent[]
  cashflows: SimCashflow[]
  userAowAge: number
  weightedGrossReturn: number
  savingsRate6m: number
  estimatedYearlyIncome: number
}) {
  const fc = useFc()
  const dateOfBirth = typeof profile?.date_of_birth === 'string' ? profile.date_of_birth : null
  const currentAge = dateOfBirth
    ? Math.floor((Date.now() - new Date(dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null

  // ── Derived inputs (no user overrides — komen uit profile/core/assets) ──
  const grossReturnPct = weightedGrossReturn * 100
  const inflationPct = fireParams.inflationRate * 100
  // Core-page income (transaction-based) wint; anders profile.net_monthly_income.
  const monthlyIncome = estimatedYearlyIncome > 0
    ? estimatedYearlyIncome / 12
    : Number(profile?.net_monthly_income ?? 0)
  // 6-month savings rate from core (same source as kern header); fallback op profile.
  const savingsRate = savingsRate6m !== 0
    ? savingsRate6m
    : Number(profile?.savings_rate ?? 0)
  const retirementMethod = (profile?.retirement_expense_method as RetirementExpenseMethod | undefined) ?? 'essential_budgets'

  // ── Gedeelde instellingen uit layout-Context ──
  const {
    endStrategy,
    endAge,
    legacyAmount,
    withdrawalStrategy,
    distributionStrategy,
    outflowDistribution,
    withdrawalOrder,
    setEndStrategy,
    setEndAge,
    setLegacyAmount,
    setWithdrawalStrategy,
    setDistributionStrategy,
    setOutflowDistribution,
    setWithdrawalOrder,
    defaults,
  } = useDoorrekeningSettings()

  // VPW is alleen toegestaan bij deplete — reset automatisch als eindstrategie verandert.
  useEffect(() => {
    if (withdrawalStrategy === 'vpw' && endStrategy !== 'deplete') {
      setWithdrawalStrategy('swr')
    }
  }, [endStrategy, withdrawalStrategy, setWithdrawalStrategy])

  // ── Aggregatie-pad (Fase 2c) ──────────────────────────────────────────
  // Overzicht is nu een *meta-view* die opbouw-forward en afbouw-backward
  // combineert. De gedeelde `useDoorrekeningSim`-hook is tijdelijk uit de
  // render-kritieke flow gehaald; bij SHOW_DIFF=true (Fase 3) komt hij terug
  // als dev-only diff-panel.

  const simCurrentAge = currentAge ?? 30
  // Horizon: pensioen loopt tot 100 (onttrekking na AOW zichtbaar houden),
  // anders de user-eindleeftijd.
  const displayEndAge = endStrategy === 'pensioen' ? 100 : endAge

  // Retirement-uitgaven — zelfde resolver als de (voormalige) sim-hook.
  const estimatedMonthlyExpenses = Number(profile?.estimated_monthly_expenses ?? 0)
  const retirementCustomAmount = Number(profile?.retirement_expense_custom_amount ?? 0)
  const yearlyRetirementExpenses = useMemo(
    () => computeRetirementExpenses(
      retirementMethod,
      yearlyMustExpenses,
      monthlyIncome * 12,
      retirementCustomAmount,
      estimatedMonthlyExpenses * 12,
    ),
    [retirementMethod, yearlyMustExpenses, monthlyIncome, retirementCustomAmount, estimatedMonthlyExpenses],
  )

  // Huishouden voor Box 3 + AOW-partner-variant.
  const householdType = String(profile?.household_type ?? 'solo')
  const hasPartner = householdType === 'samenwonend' || householdType === 'getrouwd'
  const aowHousehold = hasPartner ? 'samenwonend' : 'alleenstaand'

  // ── Distribution-strategy mapping ─────────────────────────────────────
  // Settings-context gebruikt `'proportional' | 'cash_first' | 'lowest_return'`;
  // de hybrid/afbouw engine accepteert alleen `'proportional' | 'cash_first'
  // | 'lowest_return_first'`. `lowest_return` wordt als `lowest_return_first`
  // doorgegeven (equivalent gedrag; zie G2).
  const hybridDistributionStrategy: AfbouwDistributionStrategy =
    distributionStrategy === 'proportional'
      ? 'proportional'
      : distributionStrategy === 'cash_first'
        ? 'cash_first'
        : distributionStrategy === 'highest_return'
          ? 'highest_return_first'
          : 'lowest_return_first'

  // Addendum III: `outflowDistribution` (Verdeling Afname) stuurt enkel
  // negatieve levensgebeurtenis-cashflows tijdens de opbouw-fase. Verdeling
  // Toename/Afname gelden per definitie voor events.
  const hybridOutflowDistribution: AfbouwDistributionStrategy =
    outflowDistribution === 'proportional'
      ? 'proportional'
      : outflowDistribution === 'cash_first'
        ? 'cash_first'
        : 'lowest_return_first'

  // Onttrekkingsvolgorde = volgorde waarin assets worden aangesproken
  // tijdens de afbouw-fase (pensioen-withdrawal). Dat is een aparte setting
  // van Verdeling Afname — die gaat alleen over events.
  const hybridWithdrawalOrder: AfbouwDistributionStrategy =
    withdrawalOrder === 'pro_rata'
      ? 'proportional'
      : withdrawalOrder === 'cash_first'
        ? 'cash_first'
        : withdrawalOrder === 'low_return_first'
          ? 'lowest_return_first'
          : withdrawalOrder === 'own_home_last'
            ? 'own_home_last'
            : withdrawalOrder === 'highest_value_first'
              ? 'highest_value_first'
              : 'proportional'

  // Alle withdrawal-strategy-keys uit de UI matchen 1:1 met de engine; cast
  // is een no-op maar maakt het type-contract expliciet.
  const hybridWithdrawalStrategy: AfbouwWithdrawalStrategy = withdrawalStrategy

  // ── Savings-inflow (virtueel asset) ───────────────────────────────────
  // Spaarquote-inleg wordt in de hybride projectie als virtueel `__savings`-
  // asset op index 0 gemodelleerd. Zo matchen opbouw- en afbouw-fase op
  // dezelfde indices en hoeft de UI geen aparte "cash bucket" bij te houden.
  // useMemo om een stabiele referentie aan `computeHybridProjection` te
  // geven (anders triggert de dep-array elke render een re-run).
  const savingsInflow = useMemo(() => {
    const monthly = monthlyIncome * (savingsRate / 100)
    return monthly > 0 ? { monthlyAmount: monthly } : undefined
  }, [monthlyIncome, savingsRate])

  // ── Hybride projectie — de enige primaire data-bron ───────────────────
  // Vervangt het oude trio (`computeOpbouwProjection` + `perEventYearlyCashflows`
  // + `computeAfbouwRequiredSchedule` + `findIntersection`). Alle chart- en
  // modal-consumers lezen uit `hybrid.*`.
  const hybrid = useMemo(
    () => computeHybridProjection({
      assets: assets as unknown as LibAsset[],
      debts: debts as unknown as LibDebt[],
      lifeEvents,
      cashflows,
      currentAge: simCurrentAge,
      endAge: displayEndAge,
      fireParams: {
        grossReturn: fireParams.grossReturn,
        inflationRate: fireParams.inflationRate,
        weightedGrossReturn,
      },
      endStrategy,
      endAgeConfig: endAge,
      legacyAmount,
      withdrawalStrategy: hybridWithdrawalStrategy,
      distributionStrategy: hybridDistributionStrategy,
      outflowDistribution: hybridOutflowDistribution,
      withdrawalOrder: hybridWithdrawalOrder,
      hasPartner,
      yearlyRetirementExpenses,
      aowAge: userAowAge,
      savingsInflow,
    }),
    [
      assets, debts, lifeEvents, cashflows, simCurrentAge, displayEndAge,
      fireParams.grossReturn, fireParams.inflationRate, weightedGrossReturn,
      endStrategy, endAge, legacyAmount,
      hybridWithdrawalStrategy, hybridDistributionStrategy, hybridOutflowDistribution, hybridWithdrawalOrder,
      hasPartner, yearlyRetirementExpenses, userAowAge, savingsInflow,
    ],
  )

  // ── Required-curve voor de lijn-grafiek ───────────────────────────────
  // Gebruik **dezelfde** required-curve die `computeHybridProjection`
  // intern heeft gebruikt om `fireAge` te bepalen. Een apart berekende
  // curve (zonder `perAssetContext` / `withdrawalStrategy`) kan significant
  // afwijken — de visuele kruising zou dan niet samenvallen met de
  // FIRE-marker.
  const requiredSchedule = hybrid.requiredSchedule

  // Snapshot-waarden uit de hybride projectie voor downstream consumers.
  // `fireAge` kan `endAge + 1` zijn wanneer geen kruising binnen horizon —
  // dan tonen we 'Geen kruispunt' in de UI.
  const fireAge = hybrid.fireAge <= displayEndAge ? hybrid.fireAge : null
  const fireAgeFractional = hybrid.fireAgeFractional

  // Chart mode-state (lokaal; default 'both').
  const [chartMode, setChartMode] = useState<ChartMode>('both')

  // Composition-chart view-state (lokaal; default 'by_type' = gegroepeerd per asset-type).
  const [compositionView, setCompositionView] = useState<CompositionView>('by_type')

  // Jaar-detail sheet — geopend bij klik op een composition-chart kolom. `null`
  // = dicht; anders de leeftijd in kwestie. Door alleen state te zetten bij
  // klik (niet bij hover) blijft de tooltip-interactie onaangetast.
  const [selectedYearAge, setSelectedYearAge] = useState<number | null>(null)

  // Samenstelling-aggregaat — hergebruikt `hybrid.rows` + meta zodat de
  // bar-chart exact dezelfde waarden gebruikt als de lijn-grafiek en de
  // modal. Geen nieuwe math; alleen hergroepering per view.
  const composition = useMemo(
    () => computeOpbouwComposition({
      view: compositionView,
      hybridRows: hybrid.rows,
      assetMeta: hybrid.assetMeta,
      debtMeta: hybrid.debtMeta,
    }),
    [compositionView, hybrid.rows, hybrid.assetMeta, hybrid.debtMeta],
  )

  // ── Dev-only diff-panel (Fase 3) ───────────────────────────────────────
  // Toggle is SSR-safe: initieel `false` (zodat server- en eerste-client-
  // render identiek zijn) en wordt na mount geactiveerd in development of
  // wanneer `?diff=1` in de URL staat.
  const [showDiffPanel, setShowDiffPanel] = useState(false)
  useEffect(() => {
    const isDev = process.env.NODE_ENV === 'development'
    const hasQueryFlag = typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).get('diff') === '1'
    setShowDiffPanel(isDev || hasQueryFlag)
  }, [])

  // `useDoorrekeningSim` moet onvoorwaardelijk worden aangeroepen (hooks-
  // regel). De inputs sporen exact met wat `computeOpbouwProjection` en
  // `computeAfbouwRequiredSchedule` gebruiken — zo vergelijken we appels met
  // appels. De hook is zelf een `useMemo`, dus de kosten beperken zich tot
  // één gedeelde runSimulation-pass per dep-change.
  const sim = useDoorrekeningSim({
    currentAge: simCurrentAge,
    netWorth,
    monthlyIncome,
    savingsRate,
    yearlyMustExpenses,
    estimatedYearlyIncome,
    weightedGrossReturn,
    fireParams,
    lifeEvents,
    cashflows,
    userAowAge,
    profile: profile ?? {},
  })

  // Per-jaar delta-rijen tussen de hybride pijp en runSimulation. We
  // alignen op leeftijd: `hybrid.rows[i].netWorth` ↔ `sim.rows` waar
  // `simRow.age + 1 === hybridRow.age` (runSimulation-rij dekt age → age+1,
  // net als onze hybride rij). Alleen de opbouw-fase wordt vergeleken —
  // runSimulation zelf rekent al door FIRE en is dus vergelijkbaar over de
  // hele horizon; de extra meta (phase) is het zichtbare onderscheid.
  const diffRows = useMemo(() => {
    if (!showDiffPanel) return []
    const simByEndAge = new Map<number, number>()
    for (const r of sim.rows) {
      simByEndAge.set(r.age + 1, r.endPortfolio)
    }
    return hybrid.rows.map((row) => {
      const simEnd = simByEndAge.get(row.age) ?? null
      const agg = row.netWorth
      const delta = simEnd != null ? agg - simEnd : null
      const deltaPct = simEnd != null && simEnd !== 0
        ? (delta! / simEnd) * 100
        : null
      return { age: row.age, agg, simEnd, delta, deltaPct }
    })
  }, [showDiffPanel, hybrid.rows, sim.rows])

  // Aggregaat-statistieken: max absolute delta en gemiddelde |delta%|.
  const diffStats = useMemo(() => {
    if (!diffRows.length) return { maxAbsDelta: 0, avgAbsDeltaPct: 0 }
    let maxAbsDelta = 0
    let sumAbsPct = 0
    let countPct = 0
    for (const r of diffRows) {
      if (r.delta != null && Math.abs(r.delta) > maxAbsDelta) {
        maxAbsDelta = Math.abs(r.delta)
      }
      if (r.deltaPct != null) {
        sumAbsPct += Math.abs(r.deltaPct)
        countPct++
      }
    }
    return {
      maxAbsDelta,
      avgAbsDeltaPct: countPct > 0 ? sumAbsPct / countPct : 0,
    }
  }, [diffRows])

  // Summary-row cijfers voor het diff-panel.
  const aggFireAge = fireAgeFractional
  const simFireAge = sim.fireAgeFractional ?? sim.fireAge ?? null
  const fireAgeDelta = aggFireAge != null && simFireAge != null
    ? aggFireAge - simFireAge
    : null

  const aggEnd = hybrid.rows[hybrid.rows.length - 1]?.netWorth ?? 0
  const simEnd = sim.rows[sim.rows.length - 1]?.endPortfolio ?? 0
  const endPortfolioDelta = aggEnd - simEnd

  const benodigdNuAgg = requiredSchedule[0]?.requiredPortfolio ?? null
  const benodigdNuSim = sim.requiredFirePortfolio ?? null
  const benodigdNuDelta = benodigdNuAgg != null && benodigdNuSim != null
    ? benodigdNuAgg - benodigdNuSim
    : null

  // Console-warnings bij significante divergentie. Alleen in dev-context
  // (showDiffPanel is daar true) om productie-logs schoon te houden.
  useEffect(() => {
    if (!showDiffPanel) return
    if (aggFireAge != null && simFireAge != null && Math.abs(aggFireAge - simFireAge) > 0.5) {
      // eslint-disable-next-line no-console
      console.warn(
        `[doorrekening-test] fireAge divergentie: aggregatie=${aggFireAge.toFixed(2)} vs sim=${simFireAge.toFixed(2)}`,
      )
    }
    if (simEnd > 0 && Math.abs(aggEnd - simEnd) / simEnd > 0.05) {
      // eslint-disable-next-line no-console
      console.warn(
        `[doorrekening-test] endPortfolio delta: aggregatie=${aggEnd} vs sim=${simEnd}`,
      )
    }
  }, [showDiffPanel, aggFireAge, simFireAge, aggEnd, simEnd])

  // ── Afgeleide key-metric-waarden (uit hybride projectie) ──────────────
  const firstHybridRow = hybrid.rows[0] ?? null
  const lastHybridRow = hybrid.rows[hybrid.rows.length - 1] ?? null
  const firstRequired = requiredSchedule[0]?.requiredPortfolio ?? null
  const requiredAtFire = fireAge != null
    ? (requiredSchedule.find(r => r.age === fireAge)?.requiredPortfolio ?? null)
    : null

  // Cumulatief Box 3 — laatste rij van hybride projectie bevat de som.
  const cumulativeBox3 = lastHybridRow?.cumulativeBox3Tax ?? 0

  // Som van jaarlijkse event-cashflows (excl. AOW) voor de drilldown-sectie.
  // AOW wordt apart uitgesplitst via `row.aowIncomeThisYear` — dit is het
  // totaal over alle overige events.
  const aggregatedEventInflow = hybrid.rows.reduce((s, r) => {
    const v = r.eventCashflowNetThisYear
    return v > 0 ? s + v : s
  }, 0)
  const aggregatedEventOutflow = hybrid.rows.reduce((s, r) => {
    const v = r.eventCashflowNetThisYear
    return v < 0 ? s + Math.abs(v) : s
  }, 0)

  const hasChanges = endStrategy !== defaults.endStrategy ||
    endAge !== defaults.endAge ||
    legacyAmount !== defaults.legacyAmount ||
    withdrawalStrategy !== 'swr' ||
    distributionStrategy !== 'proportional' ||
    outflowDistribution !== 'proportional' ||
    withdrawalOrder !== 'cash_first'

  function resetToDefaults() {
    setEndStrategy(defaults.endStrategy)
    setEndAge(defaults.endAge)
    setLegacyAmount(defaults.legacyAmount)
    setWithdrawalStrategy('swr')
    setDistributionStrategy('proportional')
    setOutflowDistribution('proportional')
    setWithdrawalOrder('cash_first')
  }

  // ── Uitgangspunten rows (afgeleide, read-only waarden) ──
  const activeModules: ModuleId[] = Array.isArray(profile?.active_modules)
    ? (profile?.active_modules as ModuleId[])
    : []
  const budgetingOn = isModuleActive(activeModules, 'budgetteren')
  const monthlyRetirement = yearlyRetirementExpenses / 12
  const retirementMethodLabel: Record<RetirementExpenseMethod, string> = {
    essential_budgets: 'via essentiële budgetten',
    custom_amount: 'via custom bedrag',
    current_income: 'via huidig inkomen',
  }
  const retirementSource = retirementMethodLabel[retirementMethod] ?? 'via essentiële budgetten'
  const savingsRateSource = budgetingOn ? '(6mnd gemiddelde)' : '(via netto-waarde delta)'
  const endAgeDisplay = endStrategy === 'pensioen' ? 'n.v.t. (pensioen)' : `${endAge} jaar`

  // Aggregatie-samenvattingen zijn hierboven al berekend uit `hybrid.rows`.

  return (
    <div className="space-y-6">
      {/* ── Uitgangspunten Panel ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-base font-bold text-[var(--ink)]">Uitgangspunten</h3>
          <span className="text-[11px] text-[var(--ink-4)]">Afgeleid uit profiel, budgetten en bezittingen.</span>
        </div>

        <dl className="grid grid-cols-2 gap-x-5 gap-y-3 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-5 sm:grid-cols-3 lg:grid-cols-4">
          <UitgangspuntRow
            label="Huidige leeftijd"
            value={currentAge != null ? `${currentAge} jaar` : '—'}
            href="/identity/profiel"
            sourceLabel="profiel"
          />
          <UitgangspuntRow
            label="AOW-leeftijd"
            value={userAowAge > 0 ? `${userAowAge.toFixed(1)} jaar` : '—'}
            href="/identity/profiel"
            sourceLabel="profiel"
          />
          <UitgangspuntRow
            label="Eindleeftijd"
            value={endAgeDisplay}
          />
          <UitgangspuntRow
            label="Gewogen rendement"
            value={`${grossReturnPct.toFixed(1)}%`}
            href="/identity/instellingen#fire-parameters"
            sourceLabel="instellingen"
          />
          <UitgangspuntRow
            label="Inflatie"
            value={`${inflationPct.toFixed(1)}%`}
            href="/identity/instellingen#fire-parameters"
            sourceLabel="instellingen"
          />
          <UitgangspuntRow
            label="Netto inkomen"
            value={`${fc(monthlyIncome)} /mnd`}
            href="/identity/profiel"
            sourceLabel="profiel"
          />
          <UitgangspuntRow
            label="Spaarquote"
            value={`${savingsRate.toFixed(1)}%`}
            suffix={savingsRateSource}
            href={budgetingOn ? '/kern/budgetten' : '/kern'}
            sourceLabel={budgetingOn ? 'budgetten' : 'kern'}
          />
          <UitgangspuntRow
            label="Retirement-uitgaven"
            value={`${fc(monthlyRetirement)} /mnd`}
            suffix={retirementSource}
            href="/identity/instellingen"
            sourceLabel="instellingen"
          />
          <UitgangspuntRow
            label="Box 3 rendement"
            value={`${(NL_FICTIEF_BELEGGINGEN * 100).toFixed(2)}%`}
            suffix={`tarief ${(BOX3_TARIEF * 100).toFixed(0)}%`}
          />
          <UitgangspuntRow
            label="Actieve levensgebeurtenissen"
            value={`${lifeEvents.length}`}
            href="/horizon/doorrekening-test/gebeurtenissen"
            sourceLabel="gebeurtenissen"
          />
        </dl>
      </section>

      {/* ── Settings Panel ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Settings className="h-4 w-4 text-horizon-500" />
          <h3 className="text-base font-bold text-[var(--ink)]">Instellingen</h3>
          {hasChanges && (
            <button
              onClick={resetToDefaults}
              className="ml-auto rounded-lg border border-[var(--border-ed)] px-2.5 py-1 text-[11px] font-medium text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
            >
              Reset naar profiel
            </button>
          )}
        </div>

        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-5">
          {/* Eindleeftijd — enige tijd-instelling */}
          {endStrategy === 'pensioen' ? (
            <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)]/50 px-3 py-2 text-[11px] text-[var(--ink-3)]">
              <span className="font-semibold text-[var(--ink-2)]">Kruising = AOW-leeftijd</span> ({userAowAge.toFixed(1)}j). Display tot 100 jaar.
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="end-age-input" className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Eindleeftijd
              </label>
              <input
                id="end-age-input"
                type="number"
                min={60}
                max={120}
                step={1}
                value={endAge}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (!Number.isFinite(v)) return
                  setEndAge(Math.max(60, Math.min(120, Math.round(v))))
                }}
                className="w-24 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-1.5 font-mono text-sm tabular-nums text-[var(--ink)] focus:border-horizon-400 focus:outline-none"
              />
              <span className="text-[11px] text-[var(--ink-4)]">jaar</span>
            </div>
          )}

          {/* ── Strategy Selectors — compact 2-column card grid (#683) ── */}
          <div className="mt-5 border-t border-[var(--border-ed)] pt-4">
            {endStrategy === 'pensioen' && (
              <p className="mb-3 text-[11px] text-[var(--ink-3)]">
                Kruising ligt op AOW-leeftijd ({userAowAge.toFixed(1)}j); opbouw stopt automatisch daar.
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

              {/* Card 1: Eindstrategie */}
              <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)]/30 p-3.5">
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-horizon-50 text-horizon-600">
                    <Target className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink)]">Eindstrategie</p>
                    <p className="text-[9px] text-[var(--ink-4)] leading-tight">Hoe ga je om met je vermogen?</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {END_STRATEGY_OPTIONS.map((opt) => {
                    const info = STRATEGY_LABELS[opt.key]
                    const isActive = endStrategy === opt.key
                    return (
                      <button
                        key={opt.key}
                        onClick={() => setEndStrategy(opt.key)}
                        className={`rounded-lg border px-2.5 py-1.5 text-left transition-all ${
                          isActive
                            ? 'border-horizon-400 bg-horizon-50/80 ring-1 ring-horizon-300'
                            : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--border-md)]'
                        }`}
                      >
                        <span className={`flex items-center gap-1 text-[11px] font-semibold ${
                          isActive ? 'text-horizon-700' : 'text-[var(--ink)]'
                        }`}>
                          {isActive && <span className="inline-block h-1.5 w-1.5 rounded-full bg-horizon-500" />}
                          {opt.icon} {info.name}
                        </span>
                      </button>
                    )
                  })}
                </div>
                {endStrategy === 'legacy' && (
                  <div className="mt-2 flex items-center gap-2">
                    <label className="text-[10px] font-semibold text-[var(--ink-3)]">Nalatenschap:</label>
                    <input
                      type="number"
                      min={0}
                      step={10000}
                      value={legacyAmount}
                      onChange={(e) => setLegacyAmount(Number(e.target.value))}
                      className="w-28 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1 font-mono text-xs tabular-nums text-[var(--ink)] focus:border-horizon-400 focus:outline-none"
                    />
                    <span className="text-[10px] text-[var(--ink-4)]">€</span>
                  </div>
                )}
                <p className="mt-2 text-[9px] text-[var(--ink-4)] leading-relaxed">
                  {STRATEGY_LABELS[endStrategy].subtitle}
                </p>
              </div>

              {/* Card 2: Onttrekkingsstrategie */}
              <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)]/30 p-3.5">
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-horizon-50 text-horizon-600">
                    <ArrowDownRight className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink)]">Onttrekkingsstrategie</p>
                    <p className="text-[9px] text-[var(--ink-4)] leading-tight">Hoeveel onttrek je per jaar?</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {WITHDRAWAL_STRATEGIES.map((s) => {
                    const isActive = withdrawalStrategy === s.key
                    // VPW is definitioneel depletend en incompatibel met perpetual/legacy/pensioen.
                    const isDisabled = s.key === 'vpw' && endStrategy !== 'deplete'
                    return (
                      <button
                        key={s.key}
                        onClick={() => { if (!isDisabled) setWithdrawalStrategy(s.key) }}
                        disabled={isDisabled}
                        title={isDisabled ? "Alleen mogelijk bij eindstrategie 'Vermogen opeten'." : undefined}
                        aria-disabled={isDisabled}
                        className={`rounded-lg border px-2.5 py-1.5 text-left transition-all ${
                          isDisabled
                            ? 'cursor-not-allowed border-[var(--border-ed)] bg-[var(--subtle)]/40 opacity-50'
                            : isActive
                              ? 'border-horizon-400 bg-horizon-50/80 ring-1 ring-horizon-300'
                              : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--border-md)]'
                        }`}
                      >
                        <span className={`flex items-center gap-1 text-[11px] font-semibold ${
                          isDisabled ? 'text-[var(--ink-4)]' : isActive ? 'text-horizon-700' : 'text-[var(--ink)]'
                        }`}>
                          {isActive && !isDisabled && <span className="inline-block h-1.5 w-1.5 rounded-full bg-horizon-500" />}
                          {s.name}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <p className="mt-2 text-[9px] text-[var(--ink-4)] leading-relaxed">
                  {WITHDRAWAL_STRATEGIES.find((s) => s.key === withdrawalStrategy)?.detail}
                </p>
                {endStrategy !== 'deplete' && (
                  <p className="mt-1 text-[9px] text-[var(--ink-4)] italic">
                    VPW is alleen mogelijk bij eindstrategie &lsquo;Vermogen opeten&rsquo;.
                  </p>
                )}
              </div>

              {/* Card 3: Verdeling toename (inflow) */}
              <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)]/30 p-3.5">
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink)]">Verdeling toename</p>
                    <p className="text-[9px] text-[var(--ink-4)] leading-tight">Waar gaat binnenkomend geld naartoe?</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {DISTRIBUTION_STRATEGIES.map((s) => {
                    const isActive = distributionStrategy === s.key
                    return (
                      <button
                        key={s.key}
                        onClick={() => setDistributionStrategy(s.key)}
                        className={`rounded-lg border px-2.5 py-1.5 text-left transition-all ${
                          isActive
                            ? 'border-emerald-400 bg-emerald-50/80 ring-1 ring-emerald-300'
                            : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--border-md)]'
                        }`}
                      >
                        <span className={`flex items-center gap-1 text-[11px] font-semibold ${
                          isActive ? 'text-emerald-700' : 'text-[var(--ink)]'
                        }`}>
                          {isActive && <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                          {s.name}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <p className="mt-2 text-[9px] text-[var(--ink-4)] leading-relaxed">
                  {DISTRIBUTION_STRATEGIES.find((s) => s.key === distributionStrategy)?.when}
                </p>
              </div>

              {/* Card 4: Verdeling afname (outflow) */}
              <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)]/30 p-3.5">
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                    <Shuffle className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink)]">Verdeling afname</p>
                    <p className="text-[9px] text-[var(--ink-4)] leading-tight">Waar komt uitgaand geld vandaan?</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {OUTFLOW_DISTRIBUTIONS.map((s) => {
                    const isActive = outflowDistribution === s.key
                    return (
                      <button
                        key={s.key}
                        onClick={() => setOutflowDistribution(s.key)}
                        className={`rounded-lg border px-2.5 py-1.5 text-left transition-all ${
                          isActive
                            ? 'border-amber-400 bg-amber-50/80 ring-1 ring-amber-300'
                            : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--border-md)]'
                        }`}
                      >
                        <span className={`flex items-center gap-1 text-[11px] font-semibold ${
                          isActive ? 'text-amber-700' : 'text-[var(--ink)]'
                        }`}>
                          {isActive && <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />}
                          {s.name}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <p className="mt-2 text-[9px] text-[var(--ink-4)] leading-relaxed">
                  {OUTFLOW_DISTRIBUTIONS.find((s) => s.key === outflowDistribution)?.when}
                </p>
              </div>

              {/* Card 5: Onttrekkingsvolgorde — full-width bottom row */}
              <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)]/30 p-3.5 sm:col-span-2">
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-red-600">
                    <ListOrdered className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink)]">Onttrekkingsvolgorde</p>
                    <p className="text-[9px] text-[var(--ink-4)] leading-tight">Welke bezittingen worden eerst aangesproken na stoppen met werken?</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {WITHDRAWAL_ORDERS.map((o) => {
                    const isActive = withdrawalOrder === o.key
                    return (
                      <button
                        key={o.key}
                        onClick={() => setWithdrawalOrder(o.key)}
                        className={`rounded-lg border px-2.5 py-1.5 text-left transition-all ${
                          isActive
                            ? 'border-red-400 bg-red-50/80 ring-1 ring-red-300'
                            : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--border-md)]'
                        }`}
                      >
                        <span className={`flex items-center gap-1 text-[11px] font-semibold ${
                          isActive ? 'text-red-700' : 'text-[var(--ink)]'
                        }`}>
                          {isActive && <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />}
                          {o.name}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <p className="mt-2 text-[9px] text-[var(--ink-4)] leading-relaxed">
                  {WITHDRAWAL_ORDERS.find((o) => o.key === withdrawalOrder)?.when}
                </p>
              </div>

            </div>
          </div>

        </div>
      </section>

      {/* ── Aggregatie-chart (opbouw × afbouw) ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-4 w-4 text-horizon-500" />
          <h3 className="text-base font-bold text-[var(--ink)]">Vermogensprojectie</h3>
          <span className="text-[11px] text-[var(--ink-4)]">Aggregatie van opbouw-forward en afbouw-backward.</span>
        </div>

        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-5">
          {/* Active strategy summary badges */}
          <div className="mb-4 flex flex-wrap gap-2 text-[10px]">
            <span className="rounded-full bg-horizon-50 px-2.5 py-0.5 font-medium text-horizon-700">
              {STRATEGY_LABELS[endStrategy].name}
            </span>
            <span className="rounded-full bg-horizon-50 px-2.5 py-0.5 font-medium text-horizon-700">
              {WITHDRAWAL_STRATEGIES.find((s) => s.key === withdrawalStrategy)?.name}
            </span>
            {fireAgeFractional != null && (
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 font-medium text-emerald-700">
                Vrij op {fireAgeFractional.toFixed(1)}j
              </span>
            )}
            {fireAge == null && (
              <span className="rounded-full bg-amber-50 px-2.5 py-0.5 font-medium text-amber-700">
                Geen kruispunt binnen horizon
              </span>
            )}
          </div>

          {/* Chart — eigen DoorrekeningChart met 4-mode toggle */}
          <DoorrekeningChart
            opbouwRows={hybrid.pureOpbouwRows}
            hybridRows={hybrid.rows}
            requiredSchedule={requiredSchedule}
            fireAge={fireAge}
            fireAgeFractional={fireAgeFractional}
            aowAge={userAowAge}
            endStrategy={endStrategy as DoorrekeningEndStrategy}
            currentAge={simCurrentAge}
            endAge={displayEndAge}
            mode={chartMode}
            onModeChange={setChartMode}
            legacyAmount={legacyAmount}
          />

          {/* Key metrics — aggregatie-samenvatting (plan-regel 225-226) */}
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-[var(--border-ed)] pt-5 sm:grid-cols-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Netto vermogen nu
              </p>
              <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-[var(--ink)]">
                {fc(netWorth)}
              </p>
              <p className="mt-0.5 text-[9px] text-[var(--ink-4)]">
                bruto · voor Box 3
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Kruispunt
              </p>
              <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-horizon-600">
                {fireAgeFractional != null
                  ? `${fireAgeFractional.toFixed(1)}j`
                  : 'Geen'}
              </p>
              <p className="mt-0.5 text-[9px] text-[var(--ink-4)]">
                {fireAge == null
                  ? 'Geen kruispunt in horizon'
                  : endStrategy === 'pensioen'
                    ? 'Vastgezet op AOW'
                    : 'Opbouw = benodigd'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Benodigd nu
              </p>
              <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-[var(--ink-2)]">
                {firstRequired != null ? fc(firstRequired) : 'n.v.t.'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Benodigd op kruispunt
              </p>
              <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-horizon-600">
                {requiredAtFire != null ? fc(requiredAtFire) : '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Eindvermogen
              </p>
              <p className={`mt-0.5 font-mono text-base font-semibold tabular-nums ${
                lastHybridRow && lastHybridRow.netWorth >= 0 ? 'text-[var(--ink)]' : 'text-negative'
              }`}>
                {lastHybridRow ? fc(lastHybridRow.netWorth) : '—'}
              </p>
              <p className="mt-0.5 text-[9px] text-[var(--ink-4)]">
                op {displayEndAge}j · Box 3 −{fc(cumulativeBox3)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Opbouw-samenstelling (stacked bar) ── */}
      {/*
        Plan: `kun-je-een-mogelijkheid-glittery-waterfall.md` Fase C.
        Stacked bar chart onder de lijn-grafiek. Eigen header + toggle zitten
        al in het component; de wrapper-section levert alleen de kaart-shell
        (border + bg + padding) voor visuele pariteit met de "Vermogens-
        projectie"-kaart erboven.
      */}
      <section>
        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-5">
          <OpbouwCompositionChart
            result={composition}
            currentAge={simCurrentAge}
            endAge={displayEndAge}
            fireAgeFractional={fireAgeFractional}
            aowAge={userAowAge}
            view={compositionView}
            onViewChange={setCompositionView}
            onYearClick={setSelectedYearAge}
          />
        </div>

        {/* Jaar-detail sheet — opent boven alle andere content via portal.
            Voedt uit `hybrid.rows` een enkele rij op basis van `selectedYearAge`;
            bij sluiten returnt focus naar de bar-kolom (geregeld door
            `useFocusTrap` in BottomSheet). */}
        <YearDetailsSheet
          open={selectedYearAge !== null}
          onClose={() => setSelectedYearAge(null)}
          row={
            selectedYearAge != null
              ? (hybrid.rows.find((r) => r.age === selectedYearAge) ?? null)
              : null
          }
          assetMeta={hybrid.assetMeta}
          debtMeta={hybrid.debtMeta}
          // Kalenderjaar: basisjaar + (leeftijd − huidige leeftijd). Puur een
          // delta op `new Date().getFullYear()`.
          calendarYear={
            new Date().getFullYear() +
            ((selectedYearAge ?? simCurrentAge) - simCurrentAge)
          }
          currentAge={simCurrentAge}
          inflationRate={fireParams.inflationRate}
          // Display-only props voor de event-sectie — geen sommatie hier,
          // alleen per-event labels en bedragen binnen het jaar-venster.
          lifeEvents={lifeEvents}
          cashflows={cashflows}
        />
      </section>

      {/* ── Verloop-tabel (alle jaren — bron voor de grafieken) ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-base font-bold text-[var(--ink)]">Verloop-tabel</h3>
          <span className="text-[11px] text-[var(--ink-4)]">
            De bron van de grafieken hierboven — één rij per leeftijd.
          </span>
        </div>
        <HybridTimelineTable
          rows={hybrid.rows}
          fireAge={fireAge}
          aowAge={userAowAge}
          onRowClick={setSelectedYearAge}
        />
      </section>

      {/* ── Drill-down samenvattingen ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-base font-bold text-[var(--ink)]">Onderliggende berekeningen</h3>
          <span className="text-[11px] text-[var(--ink-4)]">Klik open voor detailwaarden of navigeer naar de sub-pagina.</span>
        </div>

        <div className="divide-y divide-[var(--border-ed)] rounded-xl border border-[var(--border-ed)] bg-[var(--paper)]">
          {/* Opbouw-aggregatie */}
          <details className="group px-5 py-3.5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 outline-none focus-visible:ring-2 focus-visible:ring-horizon-400">
              <span className="flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-3)] transition-transform group-open:rotate-90" aria-hidden="true" />
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink)]">
                  Opbouw-aggregatie
                </span>
              </span>
              <Link
                href="/horizon/doorrekening-test/opbouw"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-horizon-700 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Zie details
                <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
              </Link>
            </summary>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Bezittingen nu</dt>
                <dd className="mt-0.5 font-mono text-sm tabular-nums text-[var(--ink)]">
                  {firstHybridRow ? fc(firstHybridRow.assets) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Schulden nu</dt>
                <dd className="mt-0.5 font-mono text-sm tabular-nums text-[var(--ink)]">
                  {firstHybridRow ? fc(firstHybridRow.debts) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Spaarinleg eerste jaar</dt>
                <dd className="mt-0.5 font-mono text-sm tabular-nums text-[var(--ink)]">
                  {firstHybridRow ? fc(firstHybridRow.savingsInflowThisYear) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Cumulatief Box 3</dt>
                <dd className="mt-0.5 font-mono text-sm tabular-nums text-[var(--ink)]">
                  {fc(cumulativeBox3)}
                </dd>
              </div>
            </dl>
          </details>

          {/* Afbouw-aggregatie */}
          <details className="group px-5 py-3.5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 outline-none focus-visible:ring-2 focus-visible:ring-horizon-400">
              <span className="flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-3)] transition-transform group-open:rotate-90" aria-hidden="true" />
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink)]">
                  Afbouw-aggregatie
                </span>
              </span>
              <Link
                href="/horizon/doorrekening-test/afbouw"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-horizon-700 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Zie details
                <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
              </Link>
            </summary>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Jaarlijkse uitgaven</dt>
                <dd className="mt-0.5 font-mono text-sm tabular-nums text-[var(--ink)]">
                  {fc(yearlyRetirementExpenses)}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Benodigd nu</dt>
                <dd className="mt-0.5 font-mono text-sm tabular-nums text-[var(--ink)]">
                  {firstRequired != null ? fc(firstRequired) : 'n.v.t.'}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Benodigd op kruispunt</dt>
                <dd className="mt-0.5 font-mono text-sm tabular-nums text-[var(--ink)]">
                  {requiredAtFire != null ? fc(requiredAtFire) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Horizon</dt>
                <dd className="mt-0.5 font-mono text-sm tabular-nums text-[var(--ink)]">
                  t/m {displayEndAge}j
                </dd>
              </div>
            </dl>
          </details>

          {/* Gebeurtenissen */}
          <details className="group px-5 py-3.5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 outline-none focus-visible:ring-2 focus-visible:ring-horizon-400">
              <span className="flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-3)] transition-transform group-open:rotate-90" aria-hidden="true" />
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink)]">
                  Gebeurtenissen
                </span>
              </span>
              <Link
                href="/horizon/doorrekening-test/gebeurtenissen"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-horizon-700 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Zie details
                <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
              </Link>
            </summary>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Actieve gebeurtenissen</dt>
                <dd className="mt-0.5 font-mono text-sm tabular-nums text-[var(--ink)]">
                  {lifeEvents.length}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Totaal inkomsten</dt>
                <dd className="mt-0.5 font-mono text-sm tabular-nums text-[var(--ink)]">
                  {fc(aggregatedEventInflow)}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Totaal uitgaven</dt>
                <dd className="mt-0.5 font-mono text-sm tabular-nums text-[var(--ink)]">
                  {fc(aggregatedEventOutflow)}
                </dd>
              </div>
            </dl>
          </details>
        </div>

        {showDiffPanel && (
          <div
            data-testid="diff-panel"
            className="mt-4 rounded-xl border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/40 p-4"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
              Vergelijking met /horizon (dev)
            </p>
            <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">
              Verschil tussen de aggregatie-pijp en runSimulation. Zichtbaar in
              development of via <code>?diff=1</code>. Niet zichtbaar voor
              eindgebruikers.
            </p>

            {/* Summary-row: fireAge / eindvermogen / benodigd-nu delta */}
            <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">
                  Δ FIRE-leeftijd
                </dt>
                <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                  {fireAgeDelta != null
                    ? `${fireAgeDelta >= 0 ? '+' : ''}${fireAgeDelta.toFixed(2)}j`
                    : '—'}
                </dd>
                <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">
                  agg {aggFireAge != null ? aggFireAge.toFixed(2) : '—'} · sim {simFireAge != null ? simFireAge.toFixed(2) : '—'}
                </p>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">
                  Δ Eindvermogen
                </dt>
                <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                  {endPortfolioDelta >= 0 ? '+' : ''}{fc(endPortfolioDelta)}
                </dd>
                <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">
                  agg {fc(aggEnd)} · sim {fc(simEnd)}
                </p>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">
                  Δ Benodigd nu
                </dt>
                <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                  {benodigdNuDelta != null
                    ? `${benodigdNuDelta >= 0 ? '+' : ''}${fc(benodigdNuDelta)}`
                    : '—'}
                </dd>
                <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">
                  agg {benodigdNuAgg != null ? fc(benodigdNuAgg) : '—'} · sim {benodigdNuSim != null ? fc(benodigdNuSim) : '—'}
                </p>
              </div>
            </dl>

            {/* Per-jaar delta-tabel */}
            <details className="mt-4">
              <summary className="cursor-pointer text-[11px] font-semibold text-[var(--ink-3)] hover:text-[var(--ink)]">
                Per-jaar delta ({diffRows.length} rijen)
              </summary>
              <div className="mt-2 max-h-[400px] overflow-y-auto rounded-lg border border-[var(--border-ed)] bg-[var(--paper)]">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-[var(--subtle)] text-[var(--ink-4)]">
                    <tr className="uppercase tracking-wider">
                      <th className="px-2 py-1 text-left">Leeftijd</th>
                      <th className="px-2 py-1 text-right">Agg netto</th>
                      <th className="px-2 py-1 text-right">Sim endPortfolio</th>
                      <th className="px-2 py-1 text-right">Δ</th>
                      <th className="px-2 py-1 text-right">Δ%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diffRows.map((row) => {
                      // Rijen met |Δ%| > 5 krijgen subtiele rode highlight
                      // zodat outliers direct opvallen tijdens tweaking.
                      const isOutlier = row.deltaPct != null && Math.abs(row.deltaPct) > 5
                      return (
                        <tr
                          key={row.age}
                          className={isOutlier ? 'bg-[var(--negative)]/5' : undefined}
                        >
                          <td className="px-2 py-1 font-mono tabular-nums text-[var(--ink-2)]">
                            {row.age}
                          </td>
                          <td className="px-2 py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                            {fc(row.agg)}
                          </td>
                          <td className="px-2 py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                            {row.simEnd != null ? fc(row.simEnd) : '—'}
                          </td>
                          <td
                            className={`px-2 py-1 text-right font-mono tabular-nums ${
                              isOutlier ? 'text-negative' : 'text-[var(--ink-2)]'
                            }`}
                          >
                            {row.delta != null
                              ? `${row.delta >= 0 ? '+' : ''}${fc(row.delta)}`
                              : '—'}
                          </td>
                          <td
                            className={`px-2 py-1 text-right font-mono tabular-nums ${
                              isOutlier ? 'text-negative' : 'text-[var(--ink-3)]'
                            }`}
                          >
                            {row.deltaPct != null
                              ? `${row.deltaPct >= 0 ? '+' : ''}${row.deltaPct.toFixed(2)}%`
                              : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </details>

            {/* Footer: aggregaat-divergentie-maten */}
            <p className="mt-3 text-[10px] text-[var(--ink-4)]">
              <span className="font-semibold text-[var(--ink-3)]">Max |Δ|:</span>{' '}
              <span className="font-mono tabular-nums">{fc(diffStats.maxAbsDelta)}</span>
              <span className="mx-2">·</span>
              <span className="font-semibold text-[var(--ink-3)]">Gem. |Δ%|:</span>{' '}
              <span className="font-mono tabular-nums">{diffStats.avgAbsDeltaPct.toFixed(2)}%</span>
              <span className="mx-2">·</span>
              <span className="italic">Drempels: fireAge &gt; 0.5j of endPortfolio &gt; 5% triggert console.warn.</span>
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
