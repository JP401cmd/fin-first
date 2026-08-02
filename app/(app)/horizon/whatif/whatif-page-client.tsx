'use client'

import { useEffect, useState, useCallback, useMemo, useRef, useDeferredValue } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'

/**
 * Masked-aware currency formatter hook. Returns a stable callback that
 * yields either the masked placeholder or a formatted EUR string based on
 * the global privacy toggle.
 */
function useFc() {
  const { masked } = useMaskedAmounts()
  return useCallback((v: number) => formatMaskedCurrency(v, masked), [masked])
}
import {
  type FinancialInput,
  ageAtDate,
  DEFAULT_RETURN,
  INFLATION,
  formatFireAge,
  formatFireAgeShort,
  formatFireAgeDelta,
  runMonteCarlo,
  type MonteCarloResult,
} from '@/lib/horizon-data'
import { resolveFireParams } from '@/lib/fire-params'
import { lookupAowAge, type AowLeeftijdRow, type AowAge } from '@/lib/aow-leeftijd'
import {
  type SimResult,
  type SimCashflow,
} from '@/lib/fire-simulation'
import {
  toSimResult,
  type UnifiedProjectionInput,
} from '@/lib/unified-projection'
import { buildHorizonInput } from '@/lib/horizon/build-input'
import { type LifeEvent } from '@/lib/horizon-data'
import { computeWhatifProjection } from '@/lib/horizon-kernel/whatif-router'
import type { WhatifRawProfileRow } from '@/lib/horizon-kernel/adapter/whatif-varianten'
import { WITHDRAWAL_DEFAULTS, resolveWithdrawalStrategy, type WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import { type Asset, ASSET_CLIENT_COLUMNS, ASSET_TYPE_LABELS } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { Box3Method } from '@/lib/bucket-projection'
import { computeYearlyMustExpenses, computeRetirementExpenses, type RetirementExpenseMethod } from '@/lib/budget-utils'
import { parseFireStrategy, type FireStrategyConfig, STRATEGY_LABELS } from '@/lib/fire-strategy'
import { SimChart, type ScenarioOverlay, type MonteCarloOverlay } from '@/components/app/horizon/sim-chart'
import { type SavedScenario, WHATIF_SCENARIO_COLORS } from '@/lib/scenario-types'
import { ZoomableChartContainer } from '@/components/app/horizon/zoomable-chart-container'
import { EventsTimeline } from '@/components/app/horizon/events-timeline'
import { WhatIfHeader } from '@/components/app/horizon/whatif-header'
import { WhatIfSlidersCollapsible, type WhatIfOverrides } from '@/components/app/horizon/whatif-sliders'
import { WhatIfBeslishulp } from '@/components/app/horizon/whatif-beslishulp'
import { WhatIfDevelopmentNotice } from '@/components/app/horizon/whatif-development-notice'
import { applyWhatIfOverrides, buildBaselineOverrides } from '@/lib/whatif-overrides'
import { computeDebtAflossingMonthly, computeSavingsRate6m, resolveSavingsSource } from '@/lib/savings-source'
import { resolveEffectiveIncomeExpenses } from '@/lib/effective-financials'
import { parseHousingStrategy, type HousingStrategyConfig } from '@/lib/housing-strategy'
import { hasPartner as deriveHasPartner } from '@/lib/household-type'
import {
  deriveOverridesFromEvents,
  buildSliderEvent,
  type SliderKey,
} from '@/lib/scenario-events'
import { WhatIfEventsPanel, type WhatIfEvent } from '@/components/app/horizon/whatif-events'
import { usePerspective } from '@/components/app/perspective-provider'
import { WhatIfActions } from '@/components/app/horizon/whatif-actions'
import { WhatIfPresets, PRESET_EXPLAINERS } from '@/components/app/horizon/whatif-presets'
import { type WhatIfScenarioContext } from '@/components/app/horizon/whatif-chat'
import { WhatIfScenarios } from '@/components/app/horizon/whatif-scenarios'
import { ChartOverlayExplainer } from '@/components/app/horizon/chart-overlay-explainer'
import { ChartTips } from '@/components/editorial/chart-tips'
import { getFireProjectionTips, getWealthCompositionTips } from '@/lib/chart-tips'
import { WhatIfMarketAssumptions } from '@/components/app/horizon/whatif-market-assumptions'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { useChatContext } from '@/components/app/chat/chat-provider'
import { Loader2, AlertTriangle, ArrowRight, ChevronUp, ChevronDown, Hourglass, Target, TrendingUp, Equal, Activity } from 'lucide-react'
import { WidgetEmpty } from '@/components/widgets/widget-empty'
import { IncomeExpenseChart } from '@/components/app/horizon/income-expense-chart'
import { WealthCompositionChart } from '@/components/app/horizon/wealth-composition-chart'
import { type StackedRow } from '@/lib/wealth-composition'
import { buildBreakdownFromSimRows } from '@/lib/income-expense-breakdown'

// WhatIfChat trekt de zware `ai` + `@ai-sdk/react` bundels (~30–40kB gz) mee. Die horen niet
// in de First-Load JS van deze route: de chat staat onderaan een lange pagina en wordt lang
// niet altijd gebruikt. next/dynamic met ssr:false splitst de chat + zijn ai-deps af in een
// aparte chunk die pas client-side wordt gefetcht wanneer de chat mount (ná de data-load-fase
// van de pagina). Eenmaal gemount blijft de component gemount → useChat-state en berichten-
// historie blijven behouden, analoog aan components/app/chat/chat-panel-lazy.tsx. De `loading`-
// skeleton spiegelt het card-frame zodat er geen layout-shift optreedt terwijl de chunk laadt.
const WhatIfChatDynamic = dynamic(
  () => import('@/components/app/horizon/whatif-chat').then((m) => m.WhatIfChat),
  {
    ssr: false,
    loading: () => (
      <div className="card-editorial overflow-hidden" aria-hidden="true">
        <div className="h-[3px] bg-horizon-500" />
        <div className="flex min-h-[200px] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-horizon-400" />
        </div>
      </div>
    ),
  },
)

// ── Page ────────────────────────────────────────────────────────────────────

export default function WhatIfPage() {
  const fc = useFc()
  // ── Dream gate detection ──────────────────────────────────
  const searchParams = useSearchParams()
  const viaDreamgate = useRef(searchParams.get('via') === 'dreamgate')

  // Clean up the ?via=dreamgate query param after mount
  useEffect(() => {
    if (viaDreamgate.current) {
      window.history.replaceState(null, '', '/horizon/whatif')
    }
  }, [])

  // ── Household context ───────────────────────────────────
  const { isHousehold } = usePerspective()

  // ── Base data state ──────────────────────────────────────
  const [input, setInput] = useState<FinancialInput | null>(null)
  const [events, setEvents] = useState<WhatIfEvent[]>([])
  const [fireStrategy, setFireStrategy] = useState<FireStrategyConfig | undefined>(undefined)
  const [userGrossReturn, setUserGrossReturn] = useState(DEFAULT_RETURN)
  const [userInflation, setUserInflation] = useState(INFLATION)
  const [userAowAge, setUserAowAge] = useState<AowAge>({ years: 67, months: 0, fractional: 67, isDefinitive: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fullAssets, setFullAssets] = useState<Asset[]>([])
  const [fullDebts, setFullDebts] = useState<Debt[]>([])
  const [box3Method, setBox3Method] = useState<Box3Method>('forfaitair')
  const [hasPartner, setHasPartner] = useState(false)
  const [bankAccountCash, setBankAccountCash] = useState(0)
  /** Canonieke 6m-spaarquote (incl. aflossing) — baseline voor de spaarquote-slider. */
  const [savingsRate6m, setSavingsRate6m] = useState<number | null>(null)
  /** Handmatige spaar-override uit profiles.monthly_savings_override (null = geen). */
  const [monthlySavingsOverride, setMonthlySavingsOverride] = useState<number | null>(null)
  /** Jaarlijks spaarbedrag uit de cashflow (inkomen × spaarquote) — zelfde
   *  bron als /toekomst, via resolveSavingsSource. */
  const [baseAnnualSavingsFromCashflow, setBaseAnnualSavingsFromCashflow] = useState(0)
  /** Eigen-woning-strategie — bepaalt of het huis uit de FIRE-pot wordt gefilterd. */
  const [housingStrategy, setHousingStrategy] = useState<HousingStrategyConfig>({ mode: 'include_full' })
  const [withdrawalStrategyConfig, setWithdrawalStrategyConfig] = useState<WithdrawalStrategyConfig>(WITHDRAWAL_DEFAULTS)
  /** Rauwe profiel-rij (incl. pot_rules) — kern-invoerbron voor de what-if-router
   *  (de horizon-kernel). Afwezig (vóór de mount-fetch) → geen doorrekening. */
  const [rawProfile, setRawProfile] = useState<WhatifRawProfileRow | null>(null)
  /** Rauwe AOW-tabel — voor de kern-tijdas (lookupAowAge) in de adapter. */
  const [aowRows, setAowRows] = useState<AowLeeftijdRow[]>([])

  // ── Per-asset-type return-deltas (decimaal, bv. { investment: 0.02 }). ──
  const [returnDeltas, setReturnDeltas] = useState<Record<string, number>>({})

  // ── Active preset (for ChartOverlayExplainer + baseline emphasis) ──
  const [activePresetId, setActivePresetId] = useState<string | null>(null)

  // ── Multi-scenario manager ──────────────────────────────
  /** Mirror of saved scenarios from WhatIfScenarios — used to render pinned overlays. */
  const [savedScenariosMirror, setSavedScenariosMirror] = useState<SavedScenario[]>([])
  /** Up to 2 saved scenario ids whose lines are overlaid on the chart. */
  const [pinnedScenarioIds, setPinnedScenarioIds] = useState<string[]>([])

  // ── Monte Carlo overlay toggle ──────────────────────────
  const [mcEnabled, setMcEnabled] = useState(false)

  // ── BottomSheet for full comparison ─────────────────────
  const [comparisonOpen, setComparisonOpen] = useState(false)

  // ── Chart mode + view mode ──────────────────────────
  const [chartMode, setChartMode] = useState<'vermogenspad' | 'vermogensopbouw'>('vermogenspad')
  const [ieExpanded, setIeExpanded] = useState(typeof window !== 'undefined' && window.innerWidth >= 768)
  const [ieViewMode, setIeViewMode] = useState<'lines' | 'breakdown'>('lines')

  // ── Set Fin's auto-open message for the global chat FAB ──
  const { setAutoOpenMessage } = useChatContext()

  // ── Load data ──
  // Spiegelt de FIRE-grondslag van /toekomst (horizon-data-loader): assets via
  // filterAssetsForFire op de housing-strategie, en annualSavings via dezelfde
  // resolveSavingsSource-prioriteit (override → cashflow-spaarquote →
  // asset-contributies). Zo is de baseline-FIRE-leeftijd in what-if identiek
  // aan /toekomst bij gelijke data; de "+X maanden"-delta's kloppen daarmee.
  const loadData = useCallback(async () => {
    try {
      const supabase = createClient()
      const now = new Date()
      const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().split('T')[0]
      const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)).toISOString().split('T')[0]
      const twelveMonthsAgo = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 11, 1)).toISOString().split('T')[0]
      const sixMonthsAgo = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 5, 1)).toISOString().split('T')[0]

      const [txResult, assetsResult, debtsResult, profileResult, essentialBudgetsResult, eventsResult, childBudgetsResult, income12Result, earliestIncomeResult, fullAssetsResult, fullDebtsResult, bankAccountsResult, income6mResult, expense6mResult, allBudgetsTypeResult] = await Promise.all([
        supabase.from('transactions').select('amount').gte('date', monthStart).lt('date', monthEnd),
        supabase.from('assets').select('current_value, monthly_contribution, net_worth_inclusion_pct').eq('is_active', true),
        supabase.from('debts').select('current_balance, net_worth_inclusion_pct').eq('is_active', true),
        supabase.from('profiles').select('date_of_birth, retirement_expense_method, retirement_expense_custom_amount, fire_end_strategy, fire_end_age, fire_legacy_amount, expected_return, inflation_rate, estimated_monthly_expenses, household_type, box3_method, withdrawal_strategy, guardrail_floor, guardrail_ceiling, guardrail_cut_step, guardrail_raise_step, net_monthly_income, income_source, expenses_source, monthly_savings_override, housing_strategy_config, feature_preferences').single(),
        supabase.from('budgets').select('id, name, default_limit, interval, budget_type, is_essential').eq('is_essential', true).in('budget_type', ['expense']).is('parent_id', null),
        supabase.from('life_events').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
        supabase.from('budgets').select('id, name, parent_id, default_limit, is_essential, interval, budget_type').not('parent_id', 'is', null).not('budget_type', 'in', '("archive","income","savings")'),
        supabase.from('transactions').select('amount, date').gt('amount', 0).gte('date', twelveMonthsAgo).lt('date', monthEnd),
        supabase.from('transactions').select('date').gt('amount', 0).gte('date', twelveMonthsAgo).order('date', { ascending: true }).limit(1),
        // Expliciete kolomlijst i.p.v. `select('*')`: `assets` heeft een
        // huishoud-gedeelde SELECT-policy, dus `*` levert bij een gedeelde
        // bezitting óók `account_number_hash`/`account_number_encrypted` van de
        // PARTNER in deze bundel. Zie ASSET_CLIENT_COLUMNS.
        supabase.from('assets').select(ASSET_CLIENT_COLUMNS).eq('is_active', true).limit(500),
        supabase.from('debts').select('*').eq('is_active', true).limit(200),
        supabase.from('bank_accounts').select('id, balance').eq('is_active', true).is('linked_asset_id', null),
        supabase.from('transactions').select('amount, transaction_type').eq('is_income', true).gte('date', sixMonthsAgo).lt('date', monthEnd),
        supabase.from('transactions').select('amount, transaction_type, budget_id').eq('is_income', false).gte('date', sixMonthsAgo).lt('date', monthEnd),
        // Budget-type-map-bron (parent + kind) → spaarbudget-IDs voor de
        // spaarbudget-correctie in computeSavingsRate6m (WF-REKEN-13).
        supabase.from('budgets').select('id, budget_type, parent_id'),
      ])

      // Rauwe transactie-som over de huidige kalendermaand-tot-nu-toe (zoals de
      // SSR-loaders). Deze mag laag/onvolledig zijn — de fallback zit in de
      // resolver hieronder.
      let txMonthIncome = 0
      let txMonthExpenses = 0
      for (const tx of txResult.data ?? []) {
        const amt = Number(tx.amount)
        if (amt > 0) txMonthIncome += amt
        else txMonthExpenses += Math.abs(amt)
      }
      // Canonieke effectieve maandbedragen (WF-REKEN-13): een handmatige bron
      // (income_source/expenses_source === 'manual') wint over de transactie-som;
      // bij 'auto' winnen transacties wanneer aanwezig, anders de profiel-schatting
      // (net_monthly_income / estimated_monthly_expenses). Zelfde resolver die
      // dashboard/horizon/core/fin-data-loader al consumeren — geen eigen
      // kalendermaand-optelsom-zonder-fallback meer.
      const { income: monthlyIncome, expenses: monthlyExpenses } =
        resolveEffectiveIncomeExpenses(profileResult.data ?? {}, txMonthIncome, txMonthExpenses)

      const totalAssets = (assetsResult.data ?? []).reduce((s, a) =>
        s + Number(a.current_value) * ((a.net_worth_inclusion_pct ?? 100) / 100), 0)
      const totalDebts = (debtsResult.data ?? []).reduce((s, d) =>
        s + Number(d.current_balance) * ((d.net_worth_inclusion_pct ?? 100) / 100), 0)
      const monthlyContributions = (assetsResult.data ?? []).reduce((s, a) => s + Number(a.monthly_contribution), 0)

      const last12Income = income12Result.data?.reduce((s, t) => s + Number(t.amount), 0) ?? 0
      let extrapolatedIncome = last12Income
      const earliestIncomeDate = earliestIncomeResult.data?.[0]?.date
      if (earliestIncomeDate && last12Income > 0) {
        const earliest = new Date(earliestIncomeDate)
        const incomeMonths = Math.max(1, Math.min(12,
          (now.getFullYear() - earliest.getFullYear()) * 12 +
          (now.getMonth() - earliest.getMonth())
        ))
        if (incomeMonths < 12) {
          extrapolatedIncome = (last12Income / incomeMonths) * 12
        }
      }

      const allChildren = childBudgetsResult.data ?? []
      const { yearlyMustExpenses } = computeYearlyMustExpenses(
        essentialBudgetsResult.data ?? [],
        allChildren,
      )

      const profileMonthlyExpenses = Number(profileResult.data?.estimated_monthly_expenses ?? 0)
      const yearlyRetirementExpenses = computeRetirementExpenses(
        profileResult.data?.retirement_expense_method as RetirementExpenseMethod,
        yearlyMustExpenses,
        extrapolatedIncome,
        profileResult.data?.retirement_expense_custom_amount,
        profileMonthlyExpenses * 12,
      )

      const dob = profileResult.data?.date_of_birth ?? null

      // Use fire-settings API which handles app_settings fallback for pensioen
      try {
        const fsRes = await fetch('/api/fire-settings')
        if (fsRes.ok) {
          const fsData = await fsRes.json()
          setFireStrategy({
            strategy: (['perpetual', 'legacy', 'deplete', 'pensioen'].includes(fsData.fire_end_strategy) ? fsData.fire_end_strategy : 'deplete') as FireStrategyConfig['strategy'],
            endAge: fsData.fire_end_age ?? 90,
            legacyAmount: Number(fsData.fire_legacy_amount ?? 0),
          })
        } else {
          setFireStrategy(parseFireStrategy(profileResult.data ?? {}))
        }
      } catch {
        setFireStrategy(parseFireStrategy(profileResult.data ?? {}))
      }

      // AOW-leeftijd ophalen op basis van geboortedatum
      try {
        const aowRes = await supabase
          .from('aow_leeftijd')
          .select('id, birth_date_from, birth_date_through, aow_years, aow_months, is_definitive, source')
          .order('birth_date_from', { ascending: true })
        if (aowRes.data && aowRes.data.length > 0) {
          setUserAowAge(lookupAowAge(aowRes.data as AowLeeftijdRow[], dob))
          setAowRows(aowRes.data as AowLeeftijdRow[])
        }
      } catch {
        // Non-critical — fallback to 67
      }

      // Resolve user's FIRE parameters (expected_return + inflation_rate)
      const fireParams = resolveFireParams(profileResult.data ?? {})
      setUserGrossReturn(fireParams.grossReturn)
      setUserInflation(fireParams.inflationRate)

      // Store full assets/debts for unified projection engine
      setFullAssets((fullAssetsResult.data ?? []) as Asset[])
      setFullDebts((fullDebtsResult.data ?? []) as Debt[])
      const unlinkedCash = (bankAccountsResult.data ?? []).reduce((s: number, a: { balance: number | string }) => s + Number(a.balance), 0)
      setBankAccountCash(unlinkedCash)

      // Canonieke 6m-spaarquote voor de slider-baseline (WF-REKEN-13) — nu via
      // dezelfde computeSavingsRate6m-helper als horizon/dashboard/core/lever-
      // scores i.p.v. het kale savingsRateFromAggregates. Dat brengt de
      // spaarbudget-correctie mee (stortingen op savings-budgetten tellen als
      // sparen, niet als uitgave), de <6m-extrapolatie én de profiel-fallback —
      // waardoor de spaarquote-slider hetzelfde percentage toont als /toekomst.
      const isRealTx = (t: { transaction_type?: string | null }) =>
        t.transaction_type !== 'transfer' && t.transaction_type !== 'joint_transfer'
      const income6m = (income6mResult.data ?? []).filter(isRealTx)
        .reduce((s: number, t: { amount: number | string | null }) => s + Math.abs(Number(t.amount) || 0), 0)
      const expenses6m = (expense6mResult.data ?? []).filter(isRealTx)
        .reduce((s: number, t: { amount: number | string | null }) => s + Math.abs(Number(t.amount) || 0), 0)

      // Budget-type-map (parent + kind erft parent) → spaarbudget-IDs, zodat
      // stortingen op savings-budgetten uit de uitgaven-term worden gehaald.
      // Spiegelt de map-opbouw in horizon-data-loader.
      const allBudgetsForType = (allBudgetsTypeResult.data ?? []) as { id: string; budget_type: string; parent_id: string | null }[]
      const budgetTypeMap = new Map<string, string>()
      for (const b of allBudgetsForType) if (b.parent_id === null) budgetTypeMap.set(b.id, b.budget_type)
      for (const c of allBudgetsForType) {
        if (c.parent_id !== null) {
          const parentType = budgetTypeMap.get(c.parent_id)
          if (parentType) budgetTypeMap.set(c.id, parentType)
        }
      }
      const savingsBudgetIds = new Set<string>()
      for (const [id, type] of budgetTypeMap) if (type === 'savings') savingsBudgetIds.add(id)
      const savingsBudgetSpent6m = (expense6mResult.data ?? []).filter(isRealTx)
        .reduce((s: number, t: { amount: number | string | null; budget_id?: string | null }) => {
          const bid = t.budget_id
          return bid && savingsBudgetIds.has(bid) ? s + Math.abs(Number(t.amount) || 0) : s
        }, 0)

      const aflossing6m = computeDebtAflossingMonthly((fullDebtsResult.data ?? []) as Debt[]) * 6

      // Aantal maanden werkelijke data (1–6) voor de <6m-extrapolatie — zelfde
      // vroegste-inkomens-datum als de income-extrapolatie hierboven.
      let dataMonths6 = 6
      if (earliestIncomeDate) {
        const earliest = new Date(earliestIncomeDate)
        dataMonths6 = Math.max(1, Math.min(6,
          (now.getFullYear() - earliest.getFullYear()) * 12 +
          (now.getMonth() - earliest.getMonth())
        ))
      }

      const { savingsRate6m: computedSavingsRate6m, extSavingsBudget6 } = computeSavingsRate6m({
        income6m,
        expenses6m,
        savingsBudgetSpent6m,
        debtAflossing6m: aflossing6m,
        dataMonths: dataMonths6,
        // Fallback bij een (bijna) transactieloze gebruiker: de effectieve
        // maandbedragen uit de resolver (respecteert 'manual').
        fallbackMonthlyIncome: monthlyIncome,
        fallbackMonthlyExpenses: monthlyExpenses,
      })
      setSavingsRate6m(computedSavingsRate6m)

      // Jaarlijks spaarbedrag uit de cashflow (inkomen × spaarquote) via dezelfde
      // resolveSavingsSource-keuzeregel als de horizon-loader — primaire
      // FIRE-spaarbron wanneer er geen handmatige override is. Nu incl.
      // spaarbudget-storting op het handmatige pad (symmetrisch met /toekomst).
      const { baseAnnualSavings } = resolveSavingsSource({
        incomeSource: profileResult.data?.income_source,
        expensesSource: profileResult.data?.expenses_source,
        netMonthlyIncome: Number(profileResult.data?.net_monthly_income ?? 0),
        estimatedAnnualIncome: extrapolatedIncome,
        estimatedMonthlyExpenses: profileMonthlyExpenses,
        savingsRate6m: computedSavingsRate6m,
        // Handmatig pad volgt dezelfde definitie als het transactie-pad.
        monthlyDebtAflossing: aflossing6m / 6,
        monthlySavingsContribution: extSavingsBudget6 / 6,
      })
      setBaseAnnualSavingsFromCashflow(baseAnnualSavings)

      // Handmatige spaar-override + housing-strategie (zelfde bronnen als /toekomst).
      const overrideRaw = profileResult.data?.monthly_savings_override
      setMonthlySavingsOverride(overrideRaw == null ? null : Number(overrideRaw))
      setHousingStrategy(parseHousingStrategy(profileResult.data?.housing_strategy_config))

      setBox3Method(fireParams.box3Method)
      // Bug-fix: voorheen tegen de verouderde woordenschat ('samenwonend'/
      // 'getrouwd') die household_type nooit is → altijd false. Canonieke helper.
      const householdType = profileResult.data?.household_type
      setHasPartner(deriveHasPartner(householdType))

      // Resolve withdrawal strategy from user profile
      setWithdrawalStrategyConfig(resolveWithdrawalStrategy(profileResult.data ?? {}))

      // Pot-regels (B): defensieve aparte fetch (zelfde patroon als
      // dashboard-data-loader) zodat een ontbrekende kolom de what-if-load niet
      // laat falen. De kernel leest `pot_rules` zelf uit de rauwe profiel-rij.
      let rawPotRules: unknown = null
      try {
        const { data: potData } = await supabase.from('profiles').select('pot_rules').single()
        if (potData) {
          rawPotRules = potData.pot_rules
        }
      } catch {
        // Non-critical — de kernel valt terug op zijn pot-regel-defaults.
      }

      // Rauwe profiel-rij (incl. pot_rules) — kern-invoerbron voor de router
      // (FASE 5, stap 2a). Alleen geconsumeerd wanneer de kernel-vlag aan is.
      setRawProfile({
        ...(profileResult.data as WhatifRawProfileRow),
        pot_rules: rawPotRules,
      })

      const horizonInput: FinancialInput = {
        totalAssets, totalDebts, monthlyIncome, monthlyExpenses,
        monthlyContributions, yearlyMustExpenses: yearlyRetirementExpenses, dateOfBirth: dob,
      }

      setInput(horizonInput)
      setEvents((eventsResult.data ?? []).map(e => ({ ...e } as WhatIfEvent)))
      // Scenario state (overrides) is derived from events; no setOverrides call needed.
    } catch (err) {
      console.error('Error loading what-if data:', err)
      setError('Kon gegevens niet laden.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Event handlers ─────────────────────────────────────────
  const handleToggleEvent = useCallback((id: string) => {
    setEvents(prev => prev.map(e =>
      e.id === id ? { ...e, whatIfDisabled: !e.whatIfDisabled } : e
    ))
  }, [])

  const handleAddEvent = useCallback((event: WhatIfEvent) => {
    setEvents(prev => [...prev, event])
  }, [])

  const handleRemoveEvent = useCallback((id: string) => {
    setEvents(prev => prev.filter(e => e.id !== id))
  }, [])

  const handleEditEvent = useCallback((id: string, updated: WhatIfEvent) => {
    setEvents(prev => prev.map(e => e.id === id ? updated : e))
  }, [])

  // ── Derived baseline values (snapshot of real data) ──────
  // savingsRate6m: canonieke 6m-spaarquote zodat de slider start op hetzelfde
  // getal als de cashflow-pagina (null → fallback op maand-surplus).
  const baseline = useMemo<WhatIfOverrides | null>(() => {
    if (!input) return null
    return buildBaselineOverrides(input, userGrossReturn, savingsRate6m)
  }, [input, userGrossReturn, savingsRate6m])

  // ── Asset groups for MarketAssumptions preview (gewogen rendement per asset_type) ──
  const assetGroups = useMemo(() => {
    const map = new Map<string, { totalValue: number; weightedReturnSum: number }>()
    for (const a of fullAssets) {
      if (!a.is_active) continue
      const inclPct = (Number(a.net_worth_inclusion_pct ?? 100) / 100)
      const value = Number(a.current_value) * inclPct
      if (value <= 0) continue
      const baseRet = (Number(a.expected_return) / 100) || userGrossReturn
      const existing = map.get(a.asset_type)
      if (existing) {
        existing.totalValue += value
        existing.weightedReturnSum += value * baseRet
      } else {
        map.set(a.asset_type, { totalValue: value, weightedReturnSum: value * baseRet })
      }
    }
    return Array.from(map.entries()).map(([assetType, data]) => ({
      assetType,
      label: ASSET_TYPE_LABELS[assetType as keyof typeof ASSET_TYPE_LABELS] ?? assetType,
      weightedReturn: data.weightedReturnSum / data.totalValue,
    }))
  }, [fullAssets, userGrossReturn])

  // ── Current age (used by scenario events, presets, sliders) ──
  const currentAge = input?.dateOfBirth ? ageAtDate(input.dateOfBirth) : null

  // ── Load saved scenario — translate any non-baseline overrides into slider scenario-events. ──
  const handleLoadScenario = useCallback((loadedOverrides: WhatIfOverrides, loadedEvents: WhatIfEvent[]) => {
    if (!baseline || currentAge === null) {
      setEvents(loadedEvents)
      return
    }
    const sliderEvents: WhatIfEvent[] = []
    const sliderKeys: SliderKey[] = ['income', 'workdays', 'savings', 'extra_inleg']
    const sliderValueByKey: Record<SliderKey, number> = {
      income: loadedOverrides.monthlyIncome,
      workdays: loadedOverrides.workDaysPerWeek,
      savings: loadedOverrides.savingsRate,
      extra_inleg: loadedOverrides.extraContribution,
    }
    for (const key of sliderKeys) {
      const ev = buildSliderEvent(key, sliderValueByKey[key], baseline, currentAge)
      if (ev) sliderEvents.push(ev)
    }
    // Drop any incoming scenario_only events from prior loads — keep only DB events from the saved set.
    const realEvents = loadedEvents.filter(e => !e.is_scenario_only)
    setEvents([...realEvents, ...sliderEvents])
    // Restore return-delta from absolute saved value
    const deltaPp = loadedOverrides.expectedReturn - baseline.expectedReturn
    // Backward compat: saved scenarios store a single absolute expectedReturn.
    // Apply that delta uniformly to every asset-type that exists in the user's portfolio.
    if (Math.abs(deltaPp) > 0.01) {
      const uniformDelta = deltaPp / 100
      const next: Record<string, number> = {}
      for (const a of fullAssets) {
        if (a.is_active) next[a.asset_type] = uniformDelta
      }
      setReturnDeltas(next)
    } else {
      setReturnDeltas({})
    }
  }, [baseline, currentAge, fullAssets])

  // ── Pin/unpin handler for saved scenarios (max 2 overlays). ──
  const handlePinToggle = useCallback((id: string) => {
    setPinnedScenarioIds(prev => {
      if (prev.includes(id)) return prev.filter(p => p !== id)
      if (prev.length >= 2) return prev // ignore if at max
      return [...prev, id]
    })
  }, [])

  // ── Sync scenario list mirror; auto-unpin deleted ids. ──
  const handleScenariosChange = useCallback((next: SavedScenario[]) => {
    setSavedScenariosMirror(next)
    const stillExists = new Set(next.map(s => s.id))
    setPinnedScenarioIds(prev => prev.filter(id => stillExists.has(id)))
  }, [])

  // ── Event partitions (baseline = DB only, scenario = DB + scenario-only) ──
  const baselineDbEvents = useMemo(
    () => events.filter(e => !e.whatIfDisabled && !e.is_scenario_only),
    [events]
  )
  const scenarioActiveEvents = useMemo(
    () => events.filter(e => !e.whatIfDisabled),
    [events]
  )
  const scenarioOnlyEvents = useMemo(
    () => events.filter(e => e.is_scenario_only),
    [events]
  )

  // ── Derived overrides (events + return override → WhatIfOverrides shape) ──
  const overrides = useMemo<WhatIfOverrides | null>(() => {
    if (!baseline) return null
    // Translate per-asset deltas back to a single absolute expectedReturn for
    // backward-compat with the WhatIfOverrides shape consumed by Actions/Chat/Scenarios.
    // Use the average of all set deltas as a representative number.
    const deltaValues = Object.values(returnDeltas)
    const avgDelta = deltaValues.length > 0
      ? deltaValues.reduce((s, v) => s + v, 0) / deltaValues.length
      : 0
    const expectedReturnAbsolute = Math.abs(avgDelta) > 0.0001
      ? baseline.expectedReturn + avgDelta * 100
      : null
    return deriveOverridesFromEvents(scenarioOnlyEvents, baseline, expectedReturnAbsolute)
  }, [baseline, scenarioOnlyEvents, returnDeltas])


  // ── Gedeelde input-assemblage via buildHorizonInput (B, ADR 0015/0016) ──
  // SINGLE SOURCE: de what-if-baseline gebruikt nu DEZELFDE builder als
  // /toekomst (use-horizon-fire-sim) en /overzicht (dashboard-data-loader) i.p.v.
  // een eigen inline-opbouw. Daardoor krijgt de baseline — net als de hoofd-
  // grafiek — de juiste `assetLiquidations` (gekoppelde verkoop-events),
  // `skipEventIds`-onderdrukking (geen dubbeltelling) én het housing-model
  // (downsize-als-liquidatie). De factory bouwt cashflows + liquidaties per
  // event-set samen (ze horen bij elkaar), zodat een sim NIET losse cashflows
  // mag overschrijven zonder de bijbehorende liquidaties — vandaar per-sim de
  // factory aanroepen i.p.v. één base-input met losse cashflows.
  const buildInputForEvents = useCallback(
    (evs: LifeEvent[]): { input: UnifiedProjectionInput } | null => {
      if (!input) return null
      const built = buildHorizonInput({
        horizonInput: input,
        lifeEvents: evs,
        fireStrategy,
        withdrawalStrategy: withdrawalStrategyConfig,
        grossReturn: userGrossReturn,
        inflation: userInflation,
        aowAgeFractional: userAowAge.fractional,
        assets: fullAssets,
        debts: fullDebts,
        box3Method,
        hasPartner,
        bankAccountCash,
        monthlySavingsOverride,
        baseAnnualSavingsFromCashflow,
        housingStrategy,
      })
      if (!built) return null
      return { input: built.input }
    },
    [input, fireStrategy, withdrawalStrategyConfig, userGrossReturn, userInflation, userAowAge, fullAssets, fullDebts, box3Method, hasPartner, bankAccountCash, monthlySavingsOverride, baseAnnualSavingsFromCashflow, housingStrategy],
  )

  // ── Base UnifiedProjectionInput (geen scenario-events) — voor consumers die
  //    zelf cashflows overlayen (WhatIfBeslishulp) en voor annualSavings. ──────
  const baseBuilt = useMemo(() => buildInputForEvents(baselineDbEvents), [buildInputForEvents, baselineDbEvents])
  const baseUnifiedInput = baseBuilt?.input ?? null

  // ── What-if UnifiedProjectionInput — per-asset-type return-deltas toegepast in engine ──
  const whatIfBuilt = useMemo(() => buildInputForEvents(scenarioActiveEvents), [buildInputForEvents, scenarioActiveEvents])
  const whatIfUnifiedInput = useMemo<UnifiedProjectionInput | null>(() => {
    if (!whatIfBuilt) return null
    return { ...whatIfBuilt.input, returnDeltaByAssetType: returnDeltas }
  }, [whatIfBuilt, returnDeltas])

  // ── Kernel-context voor de Beslishulp ────────────────────────────────────
  // Gememoïseerd zodat de identiteit STABIEL is: een inline-object zou de
  // useCallback/useMemo's in de Beslishulp elke render invalideren en de dure
  // solveFire-runs onnodig herberekenen. rawProfile afwezig → null → de beslishulp
  // heeft geen doorrekening (zichtbare degradatie).
  const beslishulpKernel = useMemo(
    () =>
      rawProfile
        ? {
            profile: rawProfile,
            assets: fullAssets,
            aowRows,
            returnDeltaByAssetType: returnDeltas,
          }
        : null,
    [rawProfile, fullAssets, aowRows, returnDeltas],
  )

  // ── Legacy what-if FinancialInput (for dailyExpenses display only) ──────
  const { adjustedInput: whatIfInput, annualSavings: whatIfAnnualSavings_sim } = useMemo(() => {
    if (!input || !overrides || !baseline) return { adjustedInput: null as FinancialInput | null, annualSavings: 0 }
    return applyWhatIfOverrides(input, overrides, baseline)
  }, [input, overrides, baseline])

  // ── Run baseline simulation (DB events only) — IDENTIEK aan /toekomst ──────
  // De baseline draait door buildHorizonInput → assetLiquidations + skipIds +
  // housing-model identiek aan de hoofd-grafiek. cashflows komen uit built.input
  // (NIET losse lifeEventsToCashflows) zodat skipIds-onderdrukking meeloopt.
  const baselineSim = useMemo<{ result: SimResult; cashflows: SimCashflow[] } | null>(() => {
    if (!baseBuilt || !rawProfile) return null
    // Kernel-only: de baseline draait via de what-if-router (de horizon-kernel) op de
    // rauwe context. Bij een kern-fout → null (geen doorrekening, geen tweede motor).
    const outcome = computeWhatifProjection({
      rawContext: {
        profile: rawProfile,
        assets: fullAssets,
        debts: fullDebts,
        lifeEvents: baselineDbEvents,
        aowRows,
        // Baseline: geen rendement-delta.
        yearlyExpenses: baseBuilt.input.yearlyExpenses,
      },
    })
    if (!outcome.ok) return null
    return { result: toSimResult(outcome.result), cashflows: baseBuilt.input.cashflows }
  }, [baseBuilt, rawProfile, fullAssets, fullDebts, baselineDbEvents, aowRows])

  // ── Run what-if simulation (DB + scenario events; return override applied) ──
  // Slider-defer (alléén scheduling; geen formule/parameter-wijziging). Bundel de sim-inputs
  // in één object dat op exact dezelfde deps keyt als de whatIfSim-useMemo hiervóór, en defer
  // dat object. Zo hergebruikt de urgente slider-render (returnDeltas/scenarioActiveEvents
  // wijzigen per tick) het vórige sim-resultaat, terwijl de solveFire (fase 1-meting:
  // 173–419ms main-thread) in een onderbreekbare achtergrond-render draait die bij continu
  // schuiven coalesced. Slider-thumb/label hangen aan `overrides` en blijven live. Op de
  // initiële render is de deferred waarde gelijk aan de huidige.
  const whatIfSimInput = useMemo(() => ({
    whatIfBuilt,
    whatIfUnifiedInput,
    rawProfile,
    fullAssets,
    fullDebts,
    scenarioActiveEvents,
    returnDeltas,
    aowRows,
  }), [whatIfBuilt, whatIfUnifiedInput, rawProfile, fullAssets, fullDebts, scenarioActiveEvents, returnDeltas, aowRows])

  const deferredWhatIfSimInput = useDeferredValue(whatIfSimInput)

  const whatIfSim = useMemo<{ result: SimResult; cashflows: SimCashflow[] } | null>(() => {
    const p = deferredWhatIfSimInput
    if (!p.whatIfBuilt || !p.whatIfUnifiedInput || !p.rawProfile) return null
    // De kernel-tak past de rendement-delta's ZELF toe op de assets (rawContext).
    const outcome = computeWhatifProjection({
      rawContext: {
        profile: p.rawProfile,
        assets: p.fullAssets,
        debts: p.fullDebts,
        lifeEvents: p.scenarioActiveEvents,
        aowRows: p.aowRows,
        returnDeltaByAssetType: p.returnDeltas,
        yearlyExpenses: p.whatIfBuilt.input.yearlyExpenses,
      },
    })
    if (!outcome.ok) return null
    return { result: toSimResult(outcome.result), cashflows: p.whatIfBuilt.input.cashflows }
  }, [deferredWhatIfSimInput])

  // ── Pinned scenario overlays — re-run sim per pinned saved scenario ──
  const pinnedOverlays = useMemo<ScenarioOverlay[]>(() => {
    if (!input || pinnedScenarioIds.length === 0) return []
    const result: ScenarioOverlay[] = []
    for (const id of pinnedScenarioIds) {
      const scenario = savedScenariosMirror.find(s => s.id === id)
      if (!scenario) continue
      // Build LifeEvents from the saved scenario.events shape (numeric coercion).
      const scenarioEvents: WhatIfEvent[] = (scenario.events ?? [])
        .filter(e => !e.whatIfDisabled)
        .map(e => ({
          id: e.id,
          name: e.name,
          event_type: e.event_type,
          target_age: e.target_age,
          target_date: null,
          one_time_cost: Number(e.one_time_cost ?? 0),
          monthly_cost_change: Number(e.monthly_cost_change ?? 0),
          monthly_income_change: Number(e.monthly_income_change ?? 0),
          duration_months: Number(e.duration_months ?? 0),
          icon: 'Calendar',
          is_active: true,
          sort_order: 0,
          is_indexed: false,
          metadata: e.metadata ?? {},
        }))
      // Build via de gedeelde factory zodat gekoppelde verkoop-events ook in een
      // pinned scenario liquideren (cashflows + assetLiquidations samen).
      const pinBuilt = buildInputForEvents(scenarioEvents)
      if (!pinBuilt) continue
      // Translate scenario's saved absolute return → uniform delta across all asset-types.
      const pinReturnDelta = (baseline && scenario.overrides?.expectedReturn != null)
        ? (scenario.overrides.expectedReturn - baseline.expectedReturn) / 100
        : 0
      // Kernel-only: de pinned overlay draait op DEZELFDE motor als de headline-lijnen.
      // De uniforme return-shift van het scenario → `uniformReturnDelta` (kernel-tak).
      // Zonder rauwe kernel-context → geen overlay voor dit scenario.
      if (!rawProfile) continue
      const outcome = computeWhatifProjection({
        rawContext: {
          profile: rawProfile,
          assets: fullAssets,
          debts: fullDebts,
          lifeEvents: scenarioEvents,
          aowRows,
          uniformReturnDelta: pinReturnDelta,
          yearlyExpenses: pinBuilt.input.yearlyExpenses,
        },
      })
      if (!outcome.ok) continue
      const rows = toSimResult(outcome.result).rows
      const points: [number, number][] = []
      if (rows.length > 0) {
        points.push([rows[0].age, rows[0].startPortfolio])
        for (const r of rows) points.push([r.age + 1, r.endPortfolio])
      }
      const color = WHATIF_SCENARIO_COLORS[scenario.colorIndex ?? 0]
      result.push({
        name: `pinned-${scenario.id}`,
        label: scenario.name,
        color: color.hex,
        points,
      })
    }
    return result
  }, [pinnedScenarioIds, savedScenariosMirror, input, buildInputForEvents, baseline, rawProfile, fullAssets, fullDebts, aowRows])

  // ── Monte Carlo overlay (when toggled on) ─────────────
  const mcResult = useMemo<MonteCarloResult | null>(() => {
    if (!mcEnabled || !input) return null
    const yearsToShow = Math.max(20, 90 - (input.dateOfBirth ? ageAtDate(input.dateOfBirth) : 30))
    return runMonteCarlo(input, 1000, yearsToShow)
  }, [mcEnabled, input])

  const monteCarloOverlay = useMemo<MonteCarloOverlay | undefined>(() => {
    if (!mcResult || !input) return undefined
    const startAge = input.dateOfBirth ? ageAtDate(input.dateOfBirth) : 30
    return { ...mcResult.percentiles, startAge }
  }, [mcResult, input])

  // ── Impact computation (per-event FIRE delta within the scenario) ──────────────
  const computeImpact = useCallback((eventId: string) => {
    if (!input) return null

    const event = events.find(e => e.id === eventId)
    if (!event) return null

    // Simulate WITH this event (all currently-active scenario events) — via de
    // factory zodat een gekoppeld verkoop-event ook hier liquideert (cashflows +
    // assetLiquidations samen), en met de return-deltas erop.
    const eventsWithThis = scenarioActiveEvents.some(e => e.id === eventId)
      ? scenarioActiveEvents
      : [...scenarioActiveEvents, event]
    const builtWith = buildInputForEvents(eventsWithThis)
    if (!builtWith || !rawProfile) return null
    // Kernel-only: elke impact-run draait via de what-if-router (de horizon-kernel)
    // met zijn eigen event-set; een kern-fout → geen impact-chip.
    const outcomeWith = computeWhatifProjection({
      rawContext: {
        profile: rawProfile, assets: fullAssets, debts: fullDebts,
        lifeEvents: eventsWithThis, aowRows,
        returnDeltaByAssetType: returnDeltas,
        yearlyExpenses: builtWith.input.yearlyExpenses,
      },
    })
    if (!outcomeWith.ok) return null
    const simWith = toSimResult(outcomeWith.result)

    // Simulate WITHOUT this event
    const eventsWithout = scenarioActiveEvents.filter(e => e.id !== eventId)
    const builtWithout = buildInputForEvents(eventsWithout)
    if (!builtWithout) return null
    const outcomeWithout = computeWhatifProjection({
      rawContext: {
        profile: rawProfile, assets: fullAssets, debts: fullDebts,
        lifeEvents: eventsWithout, aowRows,
        returnDeltaByAssetType: returnDeltas,
        yearlyExpenses: builtWithout.input.yearlyExpenses,
      },
    })
    if (!outcomeWithout.ok) return null
    const simWithout = toSimResult(outcomeWithout.result)

    // Calculate total cost of the event
    const oneTimeCost = Number(event.one_time_cost ?? 0)
    const monthlyCost = Number(event.monthly_cost_change ?? 0)
    const monthlyIncome = Number(event.monthly_income_change ?? 0)
    const duration = Number(event.duration_months ?? 0) || 240 // assume 20yr if no duration
    const totalCost = oneTimeCost + (monthlyCost - monthlyIncome) * (Number(event.duration_months ?? 0) > 0 ? duration : 0)

    const fireAgeWith = simWith.fireAgeFractional
    const fireAgeWithout = simWithout.fireAgeFractional

    let deltaMonths: number | null = null
    if (fireAgeWith !== null && fireAgeWithout !== null) {
      deltaMonths = Math.round((fireAgeWith - fireAgeWithout) * 12)
    }

    return { event, fireAgeWith, fireAgeWithout, deltaMonths, totalCost }
  }, [input, buildInputForEvents, events, scenarioActiveEvents, returnDeltas, rawProfile, fullAssets, fullDebts, aowRows])

  // ── Derived values for display ───────────────────────────
  // (currentAge declared earlier at line ~288 for use in handleLoadScenario.)
  const baselineFireAge = baselineSim?.result.fireAgeFractional ?? null
  const whatIfFireAge = whatIfSim?.result.fireAgeFractional ?? null
  const fireAgeDelta = baselineFireAge !== null && whatIfFireAge !== null
    ? whatIfFireAge - baselineFireAge
    : null

  // Annual savings for scenario summary — derived overrides feed the legacy helper.
  const whatIfAnnualSavings = whatIfAnnualSavings_sim || (input?.monthlyContributions ?? 0) * 12
  const baselineAnnualSavings = baseUnifiedInput?.annualSavings ?? (input?.monthlyContributions ?? 0) * 12

  // ── Preset active flag (drives ChartOverlayExplainer + baseline emphasis) ──
  const presetActive = activePresetId !== null

  // ── Scenario key for SimChart animation replay ─────────
  const scenarioKey = useMemo(() => {
    if (!overrides) return 'default'
    return `${overrides.monthlyIncome}-${overrides.workDaysPerWeek}-${overrides.savingsRate}-${overrides.expectedReturn}-${overrides.extraContribution}-${scenarioActiveEvents.length}`
  }, [overrides, scenarioActiveEvents.length])

  // ── Wealth composition (simplified: inleg vs groei) ──────────
  const wealthCompositionRows: StackedRow[] = useMemo(() => {
    if (chartMode !== 'vermogensopbouw') return []
    const rows = whatIfSim?.result.rows
    if (!rows?.length) return []
    let cumulativeSavings = 0
    let cumulativeGrowth = 0
    return rows.map(r => {
      cumulativeSavings += r.savings
      cumulativeGrowth += r.growth
      const portfolio = r.endPortfolio
      // Split portfolio proportionally into "spaargeld" (contributions) and "beleggingen" (growth)
      const total = Math.max(1, cumulativeSavings + cumulativeGrowth)
      const savingsShare = Math.max(0, portfolio * (cumulativeSavings / total))
      const growthShare = Math.max(0, portfolio - savingsShare)
      return {
        age: r.age,
        spaargeld: savingsShare,
        beleggingen: growthShare,
        pensioen: 0,
        vastgoed: 0,
        overig: 0,
        schulden: 0,
      }
    })
  }, [chartMode, whatIfSim])

  // ── Income/Expense breakdown (from SimRow data) ──────────
  const ieBreakdownResult = useMemo(() => {
    if (ieViewMode !== 'breakdown') return null
    const rows = whatIfSim?.result.rows
    if (!rows?.length) return null
    return buildBreakdownFromSimRows(rows)
  }, [ieViewMode, whatIfSim])

  // ── Build scenario context for Fin's global chat (debounced) ──
  const autoOpenTimerRef = useRef<ReturnType<typeof setTimeout>>(null)
  useEffect(() => {
    if (!overrides || !baseline || !input) {
      setAutoOpenMessage(null)
      return () => setAutoOpenMessage(null)
    }

    // Debounce: only update context after 500ms of slider inactivity
    if (autoOpenTimerRef.current) clearTimeout(autoOpenTimerRef.current)
    autoOpenTimerRef.current = setTimeout(() => {
      const scenarioEvents = events.filter(e => !e.whatIfDisabled)
      const eventsDesc = scenarioEvents.length > 0
        ? scenarioEvents.map(e => {
            const parts = [e.name]
            if (e.target_age) parts.push(`leeftijd ${e.target_age}`)
            if (Number(e.one_time_cost) > 0) parts.push(fc(Number(e.one_time_cost)) + ' eenmalig')
            if (Number(e.monthly_cost_change) !== 0) parts.push(fc(Number(e.monthly_cost_change)) + '/mnd')
            return parts.join(', ')
          }).join('; ')
        : 'geen'

      const lines = [
        'Ik zit op de Wat-Als scenario pagina. Hier is mijn scenario:',
        '',
        `Werkelijkheid: FIRE op ${baselineFireAge !== null ? Math.floor(baselineFireAge) + ' jaar' : 'onbekend'}, ` +
          `${fc(baselineAnnualSavings)}/jr sparen, ` +
          `inkomen ${fc(baseline.monthlyIncome)}/mnd`,
        '',
        `Mijn wat-als scenario: inkomen ${fc(overrides.monthlyIncome)}/mnd, ` +
          `${overrides.workDaysPerWeek} werkdagen/week, ` +
          `spaarquote ${Math.round(overrides.savingsRate)}%, ` +
          `rendement ${overrides.expectedReturn.toFixed(1)}%` +
          (overrides.extraContribution > 0 ? `, extra inleg ${fc(overrides.extraContribution)}/mnd` : ''),
        '',
        `Resultaat: FIRE op ${whatIfFireAge !== null ? Math.floor(whatIfFireAge) + ' jaar' : 'onbereikbaar'}` +
          (fireAgeDelta !== null && Math.abs(fireAgeDelta) > 0.1
            ? ` (${formatFireAgeDelta(fireAgeDelta)} verschil)`
            : '') +
          `, ${fc(whatIfAnnualSavings)}/jr sparen`,
        '',
        `Levensgebeurtenissen in scenario: ${eventsDesc}`,
        '',
        'Help me met concrete acties die ik nu kan nemen om dit scenario werkelijkheid te maken.',
      ]

      setAutoOpenMessage(lines.join('\n'))
    }, 500)

    return () => {
      if (autoOpenTimerRef.current) clearTimeout(autoOpenTimerRef.current)
      setAutoOpenMessage(null)
    }
  }, [
    setAutoOpenMessage, overrides, baseline, input, events,
    baselineFireAge, whatIfFireAge, fireAgeDelta,
    baselineAnnualSavings, whatIfAnnualSavings,
  ])

  // ── Scenario context for WhatIfChat ──────────────────────
  const chatScenarioContext = useMemo<WhatIfScenarioContext | undefined>(() => {
    if (!overrides || !baseline) return undefined
    return {
      sliders: {
        inkomensWijziging: Math.round(overrides.monthlyIncome - baseline.monthlyIncome),
        werkdagenWijziging: Math.round((overrides.workDaysPerWeek - baseline.workDaysPerWeek) * 10) / 10,
        spaarquoteWijziging: Math.round((overrides.savingsRate - baseline.savingsRate) * 10) / 10,
        rendementWijziging: Math.round((overrides.expectedReturn - baseline.expectedReturn) * 10) / 10,
        extraInleg: overrides.extraContribution,
      },
      baselineFireAge: baselineFireAge != null ? Math.round(baselineFireAge * 10) / 10 : null,
      scenarioFireAge: whatIfFireAge != null ? Math.round(whatIfFireAge * 10) / 10 : null,
      fireDeltaMonths: fireAgeDelta != null ? Math.round(fireAgeDelta * 12) : null,
      activeEvents: scenarioActiveEvents.map(ev => ({
        name: ev.name,
        event_type: ev.event_type,
        target_age: ev.target_age ?? null,
        one_time_cost: Number(ev.one_time_cost) || 0,
        monthly_cost_change: Number(ev.monthly_cost_change) || 0,
        monthly_income_change: Number(ev.monthly_income_change) || 0,
        duration_months: Number(ev.duration_months) || 0,
      })),
    }
  }, [overrides, baseline, baselineFireAge, whatIfFireAge, fireAgeDelta, scenarioActiveEvents])

  // Class for the dimension wrapper — skip own veil when arriving via dream gate
  const dimensionClass = viaDreamgate.current
    ? 'whatif-dimension whatif-dimension--no-veil min-h-screen'
    : 'whatif-dimension min-h-screen'

  // ── Loading state ────────────────────────────────────────
  if (loading) {
    return (
      <div className={dimensionClass}>
        <div className="whatif-world mx-auto max-w-6xl py-5 sm:py-8">
          <WhatIfHeader />
          <div className="mt-12 flex flex-col items-center justify-center gap-3 py-20">
            <Loader2 className="h-6 w-6 animate-spin text-horizon-500" />
            <p className="font-sans text-sm text-[var(--ink-3)]">Scenario laden...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !input || !overrides || !baseline) {
    return (
      <div className={dimensionClass}>
        <div className="whatif-world mx-auto max-w-6xl py-5 sm:py-8">
          <WhatIfHeader />
          <div className="mt-12 py-12">
            {error ? (
              <WidgetEmpty
                variant="first-use"
                icon={AlertTriangle}
                title="Scenario"
                description="Er is een fout opgetreden bij het laden van je scenario. Controleer je internetverbinding en probeer het opnieuw."
                action={{ label: 'Opnieuw laden', href: '/horizon/whatif' }}
              />
            ) : (
              <WidgetEmpty
                variant="first-use"
                icon={TrendingUp}
                title="Scenario"
                description="De Wat-Als simulator heeft basisgegevens nodig — voeg bezittingen toe in Het Overzicht om je toekomst te verkennen."
                action={{ label: 'Vermogen toevoegen', href: '/overzicht/bezittingen' }}
              />
            )}
          </div>
        </div>
      </div>
    )
  }

  const simResult = whatIfSim?.result ?? null
  const simCashflows = whatIfSim?.cashflows ?? []

  return (
    <div className={dimensionClass}>
      <NavStackMeta title="Wat-Als" />
      <div className="whatif-world mx-auto max-w-6xl py-4 sm:py-8">

        {/* ── Header ────────────────────────────────────────── */}
        <WhatIfHeader />

        {/* ── "Nog in ontwikkeling"-indicatie — bovenaan de ervaring.
            Gedeelde notice; op de modal-variant toont WhatIfSlidersCollapsible
            'm zelf (default), hier daarom expliciet uit op de sliders. ── */}
        <div className="mx-4 mt-4 sm:mx-6">
          <WhatIfDevelopmentNotice />
        </div>

        {/* ── Resultaat-blok: KPI + verschil-analyse + chart in één paper-card ── */}
        <section className="card-editorial overflow-hidden mt-4">
          <div className="h-1.5" style={{ background: 'var(--module-active-500)' }} />
          <div className="p-4 sm:p-6 md:p-8">


        {/* ── KPI strip — 4-koloms figures-strip (klikt naar comparison-modal) ── */}
        {simResult && baselineSim && (() => {
          const annualSavingsDelta = whatIfAnnualSavings - baselineAnnualSavings
          const targetDelta = simResult.requiredFirePortfolio - baselineSim.result.requiredFirePortfolio
          const isFirePositive = fireAgeDelta !== null ? fireAgeDelta < 0 : null
          const isSavingsPositive = annualSavingsDelta > 0
          const isTargetPositive = targetDelta < 0
          return (
            <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-b border-[var(--ink)]">
              {/* KPI 1: Vrijheidsleeftijd — winner met highlight-marker */}
              <button
                type="button"
                onClick={() => setComparisonOpen(true)}
                className="p-3 sm:p-4 border-r border-[var(--rule-soft)] [&:nth-child(-n+2)]:border-b sm:[&:nth-child(-n+2)]:border-b-0 last:border-r-0 sm:[&:nth-child(2)]:border-r text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              >
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1.5">
                  <Hourglass className="h-3 w-3 shrink-0" aria-hidden />
                  <span>Vrijheidsleeftijd</span>
                </div>
                <div
                  className="text-[24px] sm:text-[28px] font-black leading-none tracking-[-0.02em] tabular-nums"
                  style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
                >
                  <span
                    className="inline px-1"
                    style={{
                      backgroundImage:
                        'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
                    }}
                  >
                    {formatFireAgeShort(whatIfFireAge)}
                  </span>
                </div>
                <div
                  className="italic text-[11px] text-[var(--ink-3)] mt-1.5"
                  style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                >
                  scenario
                </div>
              </button>

              {/* KPI 2: Doelbedrag */}
              <button
                type="button"
                onClick={() => setComparisonOpen(true)}
                className="p-3 sm:p-4 sm:border-r sm:border-[var(--rule-soft)] [&:nth-child(-n+2)]:border-b sm:[&:nth-child(-n+2)]:border-b-0 text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              >
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1.5">
                  <Target className="h-3 w-3 shrink-0" aria-hidden />
                  <span>Doelbedrag</span>
                </div>
                <div
                  className="text-[20px] sm:text-[24px] font-black leading-none tracking-[-0.02em] tabular-nums"
                  style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
                >
                  {fc(simResult.requiredFirePortfolio)}
                </div>
                <div
                  className="italic text-[11px] text-[var(--ink-3)] mt-1.5"
                  style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                >
                  {Math.abs(targetDelta) > 100
                    ? <span style={{ color: isTargetPositive ? 'var(--positive)' : 'var(--negative)' }}>
                        {targetDelta > 0 ? '+' : ''}{fc(targetDelta)}
                      </span>
                    : 'benodigd'}
                </div>
              </button>

              {/* KPI 3: Jaarlijks sparen */}
              <button
                type="button"
                onClick={() => setComparisonOpen(true)}
                className="p-3 sm:p-4 border-r border-[var(--rule-soft)] last:border-r-0 sm:[&:not(:last-child)]:border-r text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              >
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1.5">
                  <TrendingUp className="h-3 w-3 shrink-0" aria-hidden />
                  <span>Jaarlijks sparen</span>
                </div>
                <div
                  className="text-[20px] sm:text-[24px] font-black leading-none tracking-[-0.02em] tabular-nums"
                  style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
                >
                  {fc(whatIfAnnualSavings)}
                </div>
                <div
                  className="italic text-[11px] text-[var(--ink-3)] mt-1.5"
                  style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                >
                  {Math.abs(annualSavingsDelta) > 100
                    ? <span style={{ color: isSavingsPositive ? 'var(--positive)' : 'var(--negative)' }}>
                        {annualSavingsDelta > 0 ? '+' : ''}{fc(annualSavingsDelta)}/jr
                      </span>
                    : 'per jaar'}
                </div>
              </button>

              {/* KPI 4: Verschil vs. werkelijkheid */}
              <button
                type="button"
                onClick={() => setComparisonOpen(true)}
                className="p-3 sm:p-4 text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              >
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1.5">
                  <Equal className="h-3 w-3 shrink-0" aria-hidden />
                  <span>Verschil</span>
                </div>
                <div
                  className="text-[20px] sm:text-[24px] font-black leading-none tracking-[-0.02em] tabular-nums"
                  style={{
                    fontFamily: 'var(--font-playfair, Georgia, serif)',
                    color: fireAgeDelta !== null && Math.abs(fireAgeDelta) > 0.1
                      ? (isFirePositive ? 'var(--positive)' : 'var(--negative)')
                      : 'var(--ink)',
                  }}
                >
                  {fireAgeDelta !== null && Math.abs(fireAgeDelta) > 0.1
                    ? formatFireAgeDelta(fireAgeDelta)
                    : '–'}
                </div>
                <div
                  className="italic text-[11px] text-[var(--ink-3)] mt-1.5"
                  style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                >
                  {fireAgeDelta !== null && Math.abs(fireAgeDelta) > 0.1
                    ? (isFirePositive ? 'eerder vrij' : 'later vrij')
                    : 'gelijk aan baseline'}
                </div>
              </button>
            </div>
          )
        })()}

        {/* ── Verschil-analyse onder de KPI-strip — directe impact-zicht ── */}
        {simResult && baselineSim && (
          <section className="mt-4">
            {/* Editorial section-label met module-streep */}
            <div className="mb-3 flex items-center justify-between border-b border-[var(--rule-soft)] pb-2">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="inline-block w-7 h-px shrink-0"
                  style={{ background: 'var(--module-active-500)' }}
                />
                <span className="text-[10px] uppercase tracking-[0.20em] font-mono text-[var(--module-active-700)]">
                  Verschil-analyse
                </span>
              </div>
              <span
                className="italic text-[11px] text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                werkelijkheid vs. wat-als
              </span>
            </div>

            {/* Inline comparison rows — zelfde structuur als de modal-kassabon */}
            <div className="space-y-1">
              <ComparisonRow
                label="FIRE leeftijd"
                baseValue={formatFireAge(baselineFireAge)}
                whatIfValue={formatFireAge(whatIfFireAge)}
                delta={fireAgeDelta !== null && Math.abs(fireAgeDelta) > 0.1
                  ? formatFireAgeDelta(fireAgeDelta)
                  : null}
                isPositive={fireAgeDelta !== null ? fireAgeDelta < 0 : null}
              />
              <ComparisonRow
                label="Doelbedrag"
                baseValue={fc(baselineSim.result.requiredFirePortfolio)}
                whatIfValue={fc(simResult.requiredFirePortfolio)}
                delta={
                  Math.abs(simResult.requiredFirePortfolio - baselineSim.result.requiredFirePortfolio) > 100
                    ? fc(simResult.requiredFirePortfolio - baselineSim.result.requiredFirePortfolio)
                    : null
                }
                isPositive={simResult.requiredFirePortfolio < baselineSim.result.requiredFirePortfolio}
              />
              <ComparisonRow
                label="Jaarlijks sparen"
                baseValue={fc(baselineAnnualSavings) + '/jr'}
                whatIfValue={fc(whatIfAnnualSavings) + '/jr'}
                delta={
                  Math.abs(whatIfAnnualSavings - baselineAnnualSavings) > 100
                    ? `${whatIfAnnualSavings > baselineAnnualSavings ? '+' : ''}${fc(whatIfAnnualSavings - baselineAnnualSavings)}`
                    : null
                }
                isPositive={whatIfAnnualSavings > baselineAnnualSavings}
              />
            </div>

            {/* Strategie totaal-rij — dubbele lijn boven, editorial */}
            <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 border-t-2 border-double border-[var(--ink)] pt-2.5">
              <span
                className="italic text-[12px] text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                Strategie
              </span>
              <span className="w-3 sm:w-3.5" />
              <span
                className="font-mono text-[12px] font-medium text-[var(--ink)] tabular-nums"
              >
                {STRATEGY_LABELS[simResult.strategy].name}
              </span>
            </div>

            {/* Optionele drill-in naar volledige kassabon */}
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setComparisonOpen(true)}
                className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] hover:text-[var(--ink)]"
              >
                Volledige kassabon
                <ArrowRight className="h-3 w-3" aria-hidden />
              </button>
            </div>
          </section>
        )}

        {/* ── Full-width chart (like horizon page) ─────────────── */}
        {simResult && (
          <section className="mt-4">
            {!simResult.fireReachable && (
              <div className="mb-4 flex items-start gap-2.5 rounded-[var(--r)] border border-dashed border-orange-300 bg-orange-50/60 px-3 py-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                <p className="font-sans text-[12px] text-orange-700">
                  FIRE niet bereikbaar voor leeftijd {simResult.displayEndAge} — pas je scenario aan.
                </p>
              </div>
            )}

            {/* ── Editorial overlay-explainer when a preset is active ─────── */}
            <ChartOverlayExplainer active={presetActive && !!activePresetId}>
              {activePresetId ? PRESET_EXPLAINERS[activePresetId] : ''}
            </ChartOverlayExplainer>

            {/* ── Chart toolbar: Monte Carlo toggle + mode toggle ─────── */}
            <div className="mb-2 flex flex-wrap items-center justify-end gap-1">
              {chartMode === 'vermogenspad' && (
                <button
                  type="button"
                  onClick={() => setMcEnabled(prev => !prev)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors select-none ${
                    mcEnabled
                      ? 'border-horizon-300 bg-horizon-50 text-horizon-700'
                      : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-horizon-200 hover:text-[var(--ink-2)]'
                  }`}
                  aria-pressed={mcEnabled}
                  style={{ minHeight: 32 }}
                  title="Toon p10-p90 onzekerheidsbanden (1000 simulaties)"
                >
                  <Activity className="h-3 w-3" aria-hidden />
                  Onzekerheid
                </button>
              )}
              {(['vermogenspad', 'vermogensopbouw'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setChartMode(mode)}
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors select-none ${
                    chartMode === mode
                      ? 'border-horizon-300 bg-horizon-50 text-horizon-700'
                      : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-horizon-200 hover:text-[var(--ink-2)]'
                  }`}
                  aria-pressed={chartMode === mode}
                  style={{ minHeight: 32 }}
                >
                  {mode === 'vermogenspad' ? 'Pad' : 'Opbouw'}
                </button>
              ))}

              {/* ── Inline ChartTips: kleine "i" met editorial popover ── */}
              <ChartTips
                storageKey="whatif_main_chart"
                tips={
                  chartMode === 'vermogenspad'
                    ? getFireProjectionTips({
                        fireAge: simResult.fireAge,
                        aowAge: Math.round(userAowAge.fractional),
                        currentAge: currentAge ?? 30,
                        hasMonteCarlo: !!monteCarloOverlay,
                        hasScenario: pinnedOverlays.length > 0,
                        hasBaseline: !!baselineSim,
                        planningMode: 'fire',
                      })
                    : getWealthCompositionTips({
                        fireAge: simResult.fireAge,
                        aowAge: Math.round(userAowAge.fractional),
                        currentAge: currentAge ?? 30,
                      })
                }
                align="right"
              />
            </div>

            <div className="-mx-4 sm:-mx-6 md:-mx-8 overflow-hidden">
              <ZoomableChartContainer currentAge={currentAge ?? 30} endAge={simResult.displayEndAge}>
                {(visibleMin, visibleMax) => (
                  <>
                    {chartMode === 'vermogenspad' ? (
                      <SimChart
                        key={scenarioKey}
                        rows={simResult.rows}
                        fireAge={simResult.fireAge}
                        fireAgeFractional={simResult.fireAgeFractional}
                        currentAge={currentAge ?? 30}
                        endAge={simResult.displayEndAge}
                        cashflows={simCashflows}
                        fireTarget={simResult.requiredFirePortfolio}
                        strategy={simResult.strategy}
                        targetEndPortfolio={simResult.targetEndPortfolio}
                        baselineRows={baselineSim?.result.rows}
                        baselineFireAge={baselineFireAge}
                        baselineEmphasis={(presetActive || pinnedOverlays.length > 0) ? 'compare' : 'ghost'}
                        scenarioOverlays={pinnedOverlays.length > 0 ? pinnedOverlays : undefined}
                        monteCarloOverlay={monteCarloOverlay}
                        dailyExpenseRate={input ? input.yearlyMustExpenses / 365 : undefined}
                        visibleMinAge={visibleMin}
                        visibleMaxAge={visibleMax}
                        aowAgeFractional={userAowAge.fractional}
                      />
                    ) : (
                      <WealthCompositionChart
                        stackedRows={wealthCompositionRows}
                        currentAge={currentAge ?? 30}
                        endAge={simResult.displayEndAge}
                        visibleMinAge={visibleMin}
                        visibleMaxAge={visibleMax}
                        fireAge={simResult.fireAge}
                        fireAgeFractional={simResult.fireAgeFractional}
                      />
                    )}
                    {events.length > 0 && (
                      <EventsTimeline
                        events={events.filter(e => !e.whatIfDisabled)}
                        currentAge={currentAge ?? 30}
                        endAge={simResult.displayEndAge}
                        visibleMinAge={visibleMin}
                        visibleMaxAge={visibleMax}
                      />
                    )}
                    {/* Vermogensstromen toggle + chart */}
                    <div className="border-t border-[var(--border-ed)]">
                      <div className="flex items-center">
                        <button
                          type="button"
                          onClick={() => setIeExpanded(prev => !prev)}
                          className="flex flex-1 items-center justify-center gap-2 py-2.5 text-[12px] font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors cursor-pointer select-none"
                          style={{ minHeight: 44 }}
                          aria-expanded={ieExpanded}
                          aria-label={ieExpanded ? 'Vermogensstromen verbergen' : 'Vermogensstromen tonen'}
                        >
                          <span>Inkomen &amp; Uitgaven</span>
                          {ieExpanded
                            ? <ChevronUp size={14} />
                            : <ChevronDown size={14} />
                          }
                        </button>
                        {ieExpanded && (
                          <div className="flex items-center gap-0.5 pr-3">
                            <button
                              type="button"
                              onClick={() => setIeViewMode('lines')}
                              className={`px-3 py-2.5 text-[10px] uppercase tracking-[0.08em] font-medium transition-colors cursor-pointer ${
                                ieViewMode === 'lines'
                                  ? 'text-[var(--ink)] bg-[var(--subtle)]'
                                  : 'text-[var(--ink-4)] hover:text-[var(--ink-3)]'
                              }`}
                              style={{ minHeight: 32 }}
                            >
                              Lijnen
                            </button>
                            <button
                              type="button"
                              onClick={() => setIeViewMode('breakdown')}
                              className={`px-3 py-2.5 text-[10px] uppercase tracking-[0.08em] font-medium transition-colors cursor-pointer ${
                                ieViewMode === 'breakdown'
                                  ? 'text-[var(--ink)] bg-[var(--subtle)]'
                                  : 'text-[var(--ink-4)] hover:text-[var(--ink-3)]'
                              }`}
                              style={{ minHeight: 32 }}
                            >
                              Bronnen
                            </button>
                          </div>
                        )}
                      </div>
                      <div
                        style={{
                          maxHeight: ieExpanded ? 300 : 0,
                          overflow: 'hidden',
                          opacity: ieExpanded ? 1 : 0,
                          transition: 'max-height 0.3s ease, opacity 0.2s ease',
                        }}
                      >
                        <IncomeExpenseChart
                          rows={simResult.rows}
                          baselineRows={baselineSim?.result.rows}
                          currentAge={currentAge ?? 30}
                          endAge={simResult.displayEndAge}
                          visibleMinAge={visibleMin}
                          visibleMaxAge={visibleMax}
                          fireAge={simResult.fireAge}
                          viewMode={ieViewMode}
                          breakdownResult={ieBreakdownResult}
                        />
                      </div>
                    </div>
                  </>
                )}
              </ZoomableChartContainer>
            </div>

            {/* Legenda + cashflow pills */}
            <div className="mt-2 flex flex-wrap items-center gap-4 font-sans text-[10px] text-[var(--ink-4)]">
              <span className="flex items-center gap-1.5">
                <svg width="20" height="3" aria-hidden="true">
                  <line
                    x1="0" y1="1.5" x2="20" y2="1.5"
                    stroke={presetActive ? 'var(--color-horizon-700, #8a6e42)' : 'var(--ink-4)'}
                    strokeWidth="2.5"
                    opacity={presetActive ? 0.85 : 0.55}
                  />
                </svg>
                {presetActive ? 'Werkelijkheid' : 'Huidige realiteit'}
              </span>
              <span className="flex items-center gap-1.5">
                <svg width="20" height="2" aria-hidden="true">
                  <line x1="0" y1="1" x2="20" y2="1" stroke="var(--hor-t, #8a6e42)" strokeWidth="2.5" />
                </svg>
                {presetActive ? 'Scenario' : 'Wat-als scenario'}
              </span>
              {ieExpanded && (
                <>
                  <span className="flex items-center gap-1.5">
                    <svg width="20" height="2" aria-hidden="true">
                      <line x1="0" y1="1" x2="20" y2="1" stroke="var(--color-horizon-500, #c4a06b)" strokeWidth="2" />
                    </svg>
                    Instroom
                  </span>
                  <span className="flex items-center gap-1.5">
                    <svg width="20" height="2" aria-hidden="true">
                      <line x1="0" y1="1" x2="20" y2="1" stroke="var(--color-kern-500, #6b4339)" strokeWidth="2" />
                    </svg>
                    Uitstroom
                  </span>
                </>
              )}
            </div>
          </section>
        )}

          </div>
        </section>

        {/* ── Single-column controls — presets first as hero ─────── */}
        <div className="mt-4 px-4 sm:px-6 space-y-4">

          {/* Presets — toggle-eerst, hero-positie */}
          <div className="card-editorial overflow-hidden">
            <div className="h-[3px] bg-horizon-500" />
            <div className="px-4 py-4 sm:px-5 sm:py-5">
              <p className="mb-3 font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">
                Wat als ik...
              </p>
              <WhatIfPresets
                baseline={baseline}
                events={events}
                setEvents={setEvents}
                currentAge={currentAge ?? 30}
                isHousehold={isHousehold}
                onActiveChange={setActivePresetId}
              />
            </div>
          </div>

          {/* Sliders — verfijn-niveau, gesloten by default.
              developmentNotice uit: de pagina toont de notice zelf al bovenaan. */}
          <WhatIfSlidersCollapsible
            baseline={baseline}
            events={events}
            setEvents={setEvents}
            currentAge={currentAge ?? 30}
            developmentNotice={false}
          />

          {/* Beslishulp — "Wat doe je met €X/mnd extra?" (beleggen/aflossen/noodfonds).
              De rauwe kernel-context laat de beslishulp-runs op DEZELFDE motor (de
              horizon-kernel) lopen als de hoofd-what-if-lijnen. */}
          <WhatIfBeslishulp
            baseInput={whatIfUnifiedInput}
            scenarioEvents={scenarioActiveEvents}
            currentAge={currentAge ?? 30}
            debts={fullDebts}
            kernel={beslishulpKernel}
          />

          {/* Marktbias — per-asset-groep rendement-delta */}
          <WhatIfMarketAssumptions
            value={returnDeltas}
            onChange={setReturnDeltas}
            assetGroups={assetGroups}
          />

          {/* Actions */}
          <WhatIfActions
            overrides={overrides}
            baseline={baseline}
            baselineFireAge={baselineFireAge}
            whatIfFireAge={whatIfFireAge}
            whatIfAnnualSavings={whatIfAnnualSavings}
            baselineAnnualSavings={baselineAnnualSavings}
          />

          {/* Levensgebeurtenissen */}
          <WhatIfEventsPanel
            events={events}
            onToggleEvent={handleToggleEvent}
            onAddEvent={handleAddEvent}
            onRemoveEvent={handleRemoveEvent}
            onEditEvent={handleEditEvent}
            baselineFireAge={baselineFireAge}
            computeImpact={computeImpact}
            dailyExpenses={whatIfInput ? whatIfInput.monthlyExpenses / 30 : undefined}
            isHousehold={isHousehold}
          />

          {/* Bewaarde scenario's — laden + pin als overlay */}
          <WhatIfScenarios
            overrides={overrides}
            events={events}
            fireAge={whatIfFireAge}
            onLoadScenario={handleLoadScenario}
            pinnedIds={pinnedScenarioIds}
            onPinToggle={handlePinToggle}
            onScenariosChange={handleScenariosChange}
          />

          {/* Fin-chat — lazy (next/dynamic, ssr:false) zodat de ai-bundels uit de First-Load JS blijven */}
          <WhatIfChatDynamic
            onAddEvent={handleAddEvent}
            scenarioContext={chatScenarioContext}
          />
        </div>

        {/* Footer */}
        <p className="pb-8 pt-4 px-4 sm:px-6 text-center font-sans text-[10px] text-[var(--ink-4)]">
          Dit is een simulatie — geen financieel advies. Werkelijke resultaten kunnen afwijken.
        </p>

        {/* ── BottomSheet: full comparison (kassabon) ────────── */}
        {simResult && baselineSim && (
          <BottomSheet
            open={comparisonOpen}
            onClose={() => setComparisonOpen(false)}
            title="Scenariovergelijking"
          >
            <div className="p-5">
              <KassabonShell>
                {/* Header */}
                <div className="mb-3 text-center">
                  <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    SCENARIOVERGELIJKING
                  </p>
                  <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
                    Werkelijkheid vs. Wat-als scenario
                  </p>
                </div>

                {/* Column headers */}
                <div className="mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-x-3">
                  <span className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    Werkelijkheid
                  </span>
                  <span className="w-4" />
                  <span className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">
                    Wat-als
                  </span>
                </div>

                {/* Comparison rows */}
                <div className="space-y-1">
                  <ComparisonRow
                    label="FIRE leeftijd"
                    baseValue={formatFireAge(baselineFireAge)}
                    whatIfValue={formatFireAge(whatIfFireAge)}
                    delta={fireAgeDelta !== null && Math.abs(fireAgeDelta) > 0.1
                      ? formatFireAgeDelta(fireAgeDelta)
                      : null}
                    isPositive={fireAgeDelta !== null ? fireAgeDelta < 0 : null}
                  />

                  <ComparisonRow
                    label="Doelbedrag"
                    baseValue={fc(baselineSim.result.requiredFirePortfolio)}
                    whatIfValue={fc(simResult.requiredFirePortfolio)}
                    delta={
                      Math.abs(simResult.requiredFirePortfolio - baselineSim.result.requiredFirePortfolio) > 100
                        ? fc(simResult.requiredFirePortfolio - baselineSim.result.requiredFirePortfolio)
                        : null
                    }
                    isPositive={simResult.requiredFirePortfolio < baselineSim.result.requiredFirePortfolio}
                  />

                  <ComparisonRow
                    label="Jaarlijks sparen"
                    baseValue={fc(baselineAnnualSavings) + '/jr'}
                    whatIfValue={fc(whatIfAnnualSavings) + '/jr'}
                    delta={
                      Math.abs(whatIfAnnualSavings - baselineAnnualSavings) > 100
                        ? `${whatIfAnnualSavings > baselineAnnualSavings ? '+' : ''}${fc(whatIfAnnualSavings - baselineAnnualSavings)}`
                        : null
                    }
                    isPositive={whatIfAnnualSavings > baselineAnnualSavings}
                  />
                </div>

                {/* Strategie */}
                <div className="mt-2 border-t-2 border-[var(--ink)] pt-2">
                  <div className="flex justify-between">
                    <span className="font-sans text-xs text-[var(--ink-3)]">Strategie</span>
                    <span className="font-sans text-xs font-medium text-[var(--ink)]">
                      {STRATEGY_LABELS[simResult.strategy].name}
                    </span>
                  </div>
                </div>

                <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
                  Gebaseerd op huidige data en scenariosliders
                </p>
              </KassabonShell>
            </div>
          </BottomSheet>
        )}
      </div>
    </div>
  )
}

// ── ComparisonRow ────────────────────────────────────────────────────────────

function ComparisonRow({
  label,
  baseValue,
  whatIfValue,
  delta,
  isPositive,
}: {
  label: string
  baseValue: string
  whatIfValue: string
  delta: string | null
  isPositive: boolean | null
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 border-t border-dashed border-[var(--border-ed)] pt-2">
      {/* Baseline */}
      <div>
        <span className="font-sans text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">{label}</span>
        <p className="font-mono text-sm tabular-nums text-[var(--ink-3)]">{baseValue}</p>
      </div>

      {/* Arrow */}
      <ArrowRight className="h-3.5 w-3.5 text-[var(--ink-4)]" />

      {/* What-if + delta */}
      <div>
        <p className="font-mono text-sm font-medium tabular-nums text-[var(--ink)]">{whatIfValue}</p>
        {delta && (
          <span className={`mt-0.5 inline-block rounded-full px-1.5 py-0.5 font-mono text-[10px] font-medium ${
            isPositive
              ? 'bg-horizon-50 text-horizon-700'
              : 'bg-kern-50 text-kern-700'
          }`}>
            {delta}
          </span>
        )}
      </div>
    </div>
  )
}
