'use client'

/**
 * Fase 2.2 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §5.1 (pane)
 * DreamTransitionContext (plan §8.1) blijft als per-module override actief.
 */

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/format'
import { type FinancialInput, type LifeEvent, ageAtDate } from '@/lib/horizon-data'
import { FIRE_PLAN_COLUMNS, type FireStrategyConfig } from '@/lib/fire-strategy'
import { lookupAowAge } from '@/lib/aow-leeftijd'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'
import { StopPlanVragen } from '@/components/horizon/stop-plan-vragen'
import {
  planDraftEquals,
  planDraftFromSettings,
  planDraftToFireSettingsBody,
  validatePlanDraft,
  formatPlanAge,
  STOP_ANCHOR_OPTIONS,
  type PlanDraft,
} from '@/lib/horizon/plan-draft'
import {
  type WithdrawalStrategyConfig,
  type WithdrawalProfiel,
  WITHDRAWAL_DEFAULTS,
  resolveWithdrawalStrategy,
  parseWithdrawalProfileConfig,
} from '@/lib/withdrawal-strategy'
import {
  type SimResult,
  type SimRow,
} from '@/lib/fire-simulation'
import { toSimResult } from '@/lib/unified-projection'
import {
  computeConvergentieProjection,
  type ConvergentieRawContext,
  type ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import {
  computeYearlyMustExpenses,
  computeRetirementExpenses,
  type RetirementExpenseMethod,
} from '@/lib/budget-utils'
import {
  resolveEffectiveIncomeExpenses,
  type IncomeExpenseSources,
} from '@/lib/effective-financials'
import type { CashflowSettingsData } from '@/lib/cashflow-settings-data'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { HousingStrategySection } from '@/components/identity/instellingen/housing-strategy-section'
import {
  HOUSING_STRATEGY_LABELS,
  type HousingStrategyConfig,
} from '@/lib/housing-strategy'
import { STRATEGY_LABELS } from '@/lib/fire-strategy'
import {
  ANKER_KPI_LABEL,
  ankerKort,
  ankerReachFromSim,
  ankerReachYear,
  type AnkerReach,
} from '@/lib/horizon/anker-copy'
import { ArrowLeft, Shield, TrendingUp, TrendingDown, Activity, Settings, Info, Loader2 } from 'lucide-react'
import { MaskedAmount } from '@/components/app/masked-amount'

// ── Onttrekkingsprofiel-metadata (Dutch) ────────────────────────────────────
//
// De onttrekking-tab vergelijkt de VIER onttrekkingsPROFIELEN (Vast/Afnemend/
// Oplopend/Guardrails) via de horizon-kernel. Elk profiel krijgt een eigen
// categorie-herkenningskleur/icoon/stroke (géén module-identiteit): vast =
// neutraal/ink, afnemend = groen, oplopend = amber, guardrails = blauw.

interface ProfielInfo {
  label: string
  description: string
  /** Categorie-herkenningskleur (CSS value) */
  color: string
  /** Tailwind classes for card highlight */
  cardBg: string
  cardBorder: string
  /** SVG stroke color (CSS value) */
  stroke: string
}

const PROFIEL_INFO: Record<WithdrawalProfiel, ProfielInfo> = {
  vast: {
    label: 'Vast',
    description: 'Elk jaar hetzelfde bedrag, inflatie-geïndexeerd (de klassieke 4%-regel). Voorspelbaar; reageert niet op de markt.',
    color: 'var(--ink-3)',
    cardBg: 'bg-[var(--subtle)]',
    cardBorder: 'border-[var(--border-ed)]',
    stroke: 'var(--ink-3)',
  },
  afnemend: {
    label: 'Afnemend',
    description: 'Je geeft in je actieve jaren méér uit en bouwt af: go-go (fit, veel reizen) → slow-go (rustiger aan) → no-go (vooral thuis, lagere uitgaven).',
    color: '#22c55e',
    cardBg: 'bg-green-50',
    cardBorder: 'border-green-300',
    stroke: '#22c55e',
  },
  oplopend: {
    label: 'Oplopend',
    description: 'Je begint bescheiden en geeft later méér uit — denk aan zorgkosten op hoge leeftijd. Het spiegelbeeld van afnemend.',
    color: '#f59e0b',
    cardBg: 'bg-amber-50',
    cardBorder: 'border-amber-300',
    stroke: '#f59e0b',
  },
  guardrails: {
    label: 'Guardrails',
    description: 'Dynamische bandbreedte: verlaagt je opname na een slecht beursjaar, verhoogt na een goed jaar. Robuust tegen sequence-risk.',
    color: '#3b82f6',
    cardBg: 'bg-blue-50',
    cardBorder: 'border-blue-300',
    stroke: '#3b82f6',
  },
}

const PROFIEL_ICONS: Record<WithdrawalProfiel, React.ReactNode> = {
  vast: <Shield className="h-4 w-4" />,
  afnemend: <TrendingDown className="h-4 w-4" />,
  oplopend: <TrendingUp className="h-4 w-4" />,
  guardrails: <Activity className="h-4 w-4" />,
}

const ALL_PROFIELEN: WithdrawalProfiel[] = ['vast', 'afnemend', 'oplopend', 'guardrails']

// ── Modal component ────────────────────────────────────────────────────────

type StrategyTab = 'eind' | 'onttrekking' | 'woning'

interface StrategieModalProps {
  open: boolean
  onClose: () => void
  /** Initiele eigen-woning-strategie voor het header-badge. Het paneel zelf
   *  laadt/saveert via /api/housing-strategy onafhankelijk. */
  housingStrategy?: HousingStrategyConfig
  /** Tab die actief is bij openen (deep-link, bv. direct naar 'woning' vanuit
   *  de "huis wordt nooit verkocht"-melding). Default 'eind'. */
  initialTab?: StrategyTab | null
  /**
   * Rauwe kernel-convergentie-context vanuit horizon-client. De onttrekking-tab
   * vergelijkt de vier onttrekkingsPROFIELEN (Vast/Afnemend/Oplopend/Guardrails)
   * onvoorwaardelijk via de horizon-kernel. Ontbreekt de context of de
   * basisgegevens (geboortedatum/vermogen/uitgaven) → nette degradatie in de tab.
   */
  kernelRawProfile?: ConvergentieRawProfileRow | null
  kernelAssets?: Asset[]
  kernelDebts?: Debt[]
  kernelLifeEvents?: LifeEvent[]
  kernelAowRows?: AowLeeftijdRow[]
}

export function StrategieModal({ open, onClose, housingStrategy, initialTab, kernelRawProfile, kernelAssets, kernelDebts, kernelLifeEvents, kernelAowRows }: StrategieModalProps) {
  const [activeTab, setActiveTab] = useState<StrategyTab>(initialTab ?? 'eind')

  // Synchroniseer de actieve tab wanneer de modal opent met een expliciete
  // voorkeurs-tab (bv. deep-link naar 'woning'). Alleen bij open=true zodat een
  // handmatige tabwissel tijdens het openstaan niet teruggezet wordt.
  useEffect(() => {
    if (open && initialTab) setActiveTab(initialTab)
  }, [open, initialTab])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Data from Supabase
  const [input, setInput] = useState<FinancialInput | null>(null)
  const [lifeEventsRaw, setLifeEventsRaw] = useState<Array<{ name: string; target_age: number | null; event_type: string }>>([])
  const [fireStrategy, setFireStrategy] = useState<FireStrategyConfig | undefined>(undefined)
  const [withdrawalConfig, setWithdrawalConfig] = useState<WithdrawalStrategyConfig>(WITHDRAWAL_DEFAULTS)

  // Geselecteerd onttrekkingsprofiel voor de detail-weergave (chart/samenvatting).
  const [selectedProfiel, setSelectedProfiel] = useState<WithdrawalProfiel>('vast')

  // Warning when withdrawal columns couldn't be loaded
  const [strategyWarning, setStrategyWarning] = useState<string | null>(null)

  // Plan-regel (ADR 0129 B13): de modal spiegelt de twee vragen van Voorkeuren via
  // hetzelfde `StopPlanVragen`-component en bewaart per (geldige) wijziging — het
  // opgeslagen plan reist mee zodat "gewijzigd" en "ongeldig" uit elkaar blijven.
  const [planDraft, setPlanDraft] = useState<PlanDraft>({ anchor: 'solved', stopAge: null, endForm: 'deplete', endAge: 90, legacyAmount: 0 })
  const [savedPlan, setSavedPlan] = useState<PlanDraft | null>(null)
  const debouncedPlan = useDebouncedValue(planDraft, 600)
  const [endStrategySaving, setEndStrategySaving] = useState(false)
  const [endStrategyMessage, setEndStrategyMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // ── Load data ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const supabase = createClient()
      const now = new Date()
      const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().split('T')[0]
      const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)).toISOString().split('T')[0]

      const [txResult, assetsResult, debtsResult, profileResult, essentialBudgetsResult, eventsResult, childBudgetsResult, cashflowSettings] = await Promise.all([
        supabase.from('transactions').select('amount').gte('date', monthStart).lt('date', monthEnd),
        supabase.from('assets').select('current_value, monthly_contribution, net_worth_inclusion_pct').eq('is_active', true),
        supabase.from('debts').select('current_balance, net_worth_inclusion_pct').eq('is_active', true),
        supabase.from('profiles').select(`date_of_birth, retirement_expense_method, retirement_expense_custom_amount, ${FIRE_PLAN_COLUMNS}, expected_return, inflation_rate, net_monthly_income, estimated_monthly_expenses, income_source, expenses_source`).single(),
        supabase.from('budgets').select('id, name, default_limit, interval, budget_type, is_essential').eq('is_essential', true).in('budget_type', ['expense']).is('parent_id', null),
        supabase.from('life_events').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
        supabase.from('budgets').select('id, name, parent_id, default_limit, is_essential, interval, budget_type').not('parent_id', 'is', null).not('budget_type', 'in', '("archive","income","savings")'),
        // GEDEELDE GRONDSLAG (ADR 0103). Deze modal rekende zijn eigen
        // 12-maands jaarinkomen uit een rauwe transactielus — daarmee negeerde
        // hij zowel de handmatige override als (nu) de budget-grondslag, en
        // toonde hij een ander FIRE-doel dan /overzicht/budget. Het
        // jaarinkomen komt voortaan uit dezelfde bundel als de kaart die de
        // gebruiker ziet; de twee eigen inkomens-queries zijn daarmee weg.
        fetch('/api/overzicht/cashflow-settings')
          .then((r) => (r.ok ? (r.json() as Promise<CashflowSettingsData>) : null))
          .catch(() => null),
      ])

      // Fetch withdrawal strategy columns separately — these may not exist yet
      // (migration 20260318000001). By splitting, we prevent a missing-column error
      // from killing the entire profile query and crashing the page.
      let wsData: {
        withdrawal_strategy?: string | null
        guardrail_floor?: number | null
        guardrail_ceiling?: number | null
        guardrail_cut_step?: number | null
        guardrail_raise_step?: number | null
      } = {}
      try {
        const wsResult = await supabase
          .from('profiles')
          .select('withdrawal_strategy, guardrail_floor, guardrail_ceiling, guardrail_cut_step, guardrail_raise_step')
          .single()
        if (wsResult.error) {
          console.warn(
            `[strategie] Withdrawal strategy columns not available (migration pending): ${wsResult.error.code}`,
          )
          setStrategyWarning('Strategie-instellingen konden niet geladen worden. Standaardwaarden worden gebruikt.')
        } else {
          wsData = wsResult.data ?? {}
        }
      } catch (wsErr) {
        console.warn('[strategie] Failed to load withdrawal strategy columns:', wsErr)
        setStrategyWarning('Strategie-instellingen konden niet geladen worden. Standaardwaarden worden gebruikt.')
      }

      // Rauwe transactiesom over de lopende kalendermaand — mag onvolledig zijn;
      // de resolver hieronder bepaalt wat er werkelijk geldt.
      let txMonthIncome = 0
      let txMonthExpenses = 0
      for (const tx of txResult.data ?? []) {
        const amt = Number(tx.amount)
        if (amt > 0) txMonthIncome += amt
        else txMonthExpenses += Math.abs(amt)
      }
      // Canonieke effectieve maandbedragen via de ENE resolver — een handmatige
      // bron wint altijd van de (mogelijk partiële) maandsom, en de
      // budgetgrondslag doet mee zodra de gedeelde bundel binnen is. Voorheen
      // ontbrak deze stap hier volledig: de modal telde de kalendermaand rauw op
      // en negeerde daarmee stilzwijgend de handmatige override van de gebruiker
      // (ADR 0103 — de vijfde kopie van de grondslagbeslissing).
      const effective = resolveEffectiveIncomeExpenses(
        (profileResult.data ?? {}) as IncomeExpenseSources,
        txMonthIncome,
        txMonthExpenses,
        cashflowSettings
          ? {
              income: cashflowSettings.budgetIncome.monthlyTotal,
              expenses: cashflowSettings.budgetExpenses.monthlyTotal,
            }
          : undefined,
      )
      const monthlyExpenses = effective.expenses

      const totalAssets = (assetsResult.data ?? []).reduce((s, a) =>
        s + Number(a.current_value) * ((a.net_worth_inclusion_pct ?? 100) / 100), 0)
      const totalDebts = (debtsResult.data ?? []).reduce((s, d) =>
        s + Number(d.current_balance) * ((d.net_worth_inclusion_pct ?? 100) / 100), 0)
      const monthlyContributions = (assetsResult.data ?? []).reduce((s, a) => s + Number(a.monthly_contribution), 0)

      // Jaarinkomen op de GEDEELDE grondslag: `effectiveAnnualIncome` is precies
      // het getal op de inkomenskaart van /overzicht/budget en dezelfde waarde
      // die de FIRE-keten voedt. Valt de bundel weg (offline/401), dan het
      // effectieve maandinkomen × 12 — nooit een tweede, eigen extrapolatie.
      const extrapolatedIncome = cashflowSettings
        ? cashflowSettings.effectiveAnnualIncome
        : effective.income * 12
      const monthlyIncome = extrapolatedIncome / 12

      const allChildren = childBudgetsResult.data ?? []
      const { yearlyMustExpenses } = computeYearlyMustExpenses(
        essentialBudgetsResult.data ?? [],
        allChildren,
      )

      const yearlyRetirementExpenses = computeRetirementExpenses(
        profileResult.data?.retirement_expense_method as RetirementExpenseMethod,
        yearlyMustExpenses,
        extrapolatedIncome,
        profileResult.data?.retirement_expense_custom_amount,
      )

      const dob = profileResult.data?.date_of_birth ?? null

      // Het plan (anker + eind-vorm) uit /api/fire-settings — die route lost de
      // override-schaduwkolom al op; de profielrij is de terugval. Geen handmatige
      // strategie-allowlist meer (ADR 0129, ontwerpprincipe 5): `planDraftFromSettings`
      // leest beide rijvormen.
      let plan = planDraftFromSettings(profileResult.data ?? {})
      try {
        const fsRes = await fetch('/api/fire-settings')
        if (fsRes.ok) plan = planDraftFromSettings(await fsRes.json())
      } catch { /* fallback to profile data */ }
      setFireStrategy({ strategy: plan.endForm, endAge: plan.endAge, legacyAmount: plan.legacyAmount })
      setPlanDraft(plan)
      setSavedPlan(plan)

      // Resolve withdrawal strategy from separate wsData (defensive) — levert de
      // guardrail floor/ceiling voor de bandbreedte-kaart. Het gekozen PROFIEL
      // (Vast/Afnemend/Oplopend/Guardrails) leest de tab uit `kernelRawProfile`.
      const wsConfig = resolveWithdrawalStrategy(wsData)
      setWithdrawalConfig(wsConfig)

      const horizonInput: FinancialInput = {
        totalAssets, totalDebts, monthlyIncome, monthlyExpenses,
        monthlyContributions, yearlyMustExpenses: yearlyRetirementExpenses, dateOfBirth: dob,
      }

      setInput(horizonInput)

      // Life events → tijdlijn-markers (namen + doelleeftijden voor de grafiek).
      const eventData = eventsResult.data ?? []
      setLifeEventsRaw(eventData.map(e => ({
        name: e.name,
        target_age: e.target_age,
        event_type: e.event_type,
      })))
    } catch (err) {
      console.error('Error loading strategy data:', err)
      setError('Kon gegevens niet laden.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Save end strategy changes ────────────────────────────────────────────

  const savePlan = useCallback(async (plan: PlanDraft) => {
    setEndStrategySaving(true)
    setEndStrategyMessage(null)

    try {
      // Altijd het volledige plan (route-contract R3): eind-vorm + anker, nooit een
      // legacy-label als 'pensioen'.
      const res = await fetch('/api/fire-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(planDraftToFireSettingsBody(plan)),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Opslaan mislukt')

      setFireStrategy({ strategy: plan.endForm, endAge: plan.endAge, legacyAmount: plan.legacyAmount })
      setSavedPlan(plan)
      setEndStrategyMessage({ type: 'success', text: 'Plan opgeslagen.' })
      setTimeout(() => setEndStrategyMessage(null), 3000)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Opslaan mislukt'
      setEndStrategyMessage({ type: 'error', text: message })
    } finally {
      setEndStrategySaving(false)
    }
  }, [])

  // ── Derived values ──────────────────────────────────────────────────────

  const currentAge = input?.dateOfBirth ? ageAtDate(input.dateOfBirth) : null
  // AOW uit de gebruikerstabel (dezelfde lookup als de kernel-tijdas) — niet de
  // wettelijke terugval hardcoden. Voedt de AOW-toets op de eindleeftijd (M2).
  const aowAgeFractional = input?.dateOfBirth ? lookupAowAge(kernelAowRows ?? [], input.dateOfBirth).fractional : null
  const planValidatie = validatePlanDraft(planDraft, { aowAge: aowAgeFractional })

  // Autosave (600 ms rust) zodra het concept geldig én gewijzigd is. De modal
  // bewaarde vóór F3b per klik/blur; met een leeftijd-invoer erbij is "bewaar als
  // het klopt" de enige vorm die geen half plan wegschrijft.
  useEffect(() => {
    if (loading || savedPlan === null) return
    if (planDraftEquals(debouncedPlan, savedPlan)) return
    if (!validatePlanDraft(debouncedPlan, { aowAge: aowAgeFractional }).ok) return
    void savePlan(debouncedPlan)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedPlan, savedPlan, loading])
  const yearlyExpenses = input?.yearlyMustExpenses ?? 0
  const strategyForSim = useMemo<FireStrategyConfig>(
    () => fireStrategy ?? { strategy: 'deplete' as const, endAge: 90, legacyAmount: 0 },
    [fireStrategy],
  )

  // Het huidig opgeslagen onttrekkingsPROFIEL (read-only): uit
  // `withdrawal_profile_config.profiel`; valt anders terug op de guardrails-enum
  // → 'guardrails', anders 'vast'. Bepaalt de "Actief"-markering en de header-badge.
  const activeProfiel = useMemo<WithdrawalProfiel>(() => {
    const parsed = parseWithdrawalProfileConfig(kernelRawProfile ?? undefined)
    if (parsed?.profiel) return parsed.profiel
    return withdrawalConfig.strategy === 'guardrails' ? 'guardrails' : 'vast'
  }, [kernelRawProfile, withdrawalConfig.strategy])

  // Kernel-only: de onttrekking-tab vergelijkt de vier PROFIELEN via de horizon-kernel.
  // Zonder rauwe kernel-context of geldige basisgegevens tonen we een nette degradatie
  // (nooit een eigen herberekening).
  const degradedReason = useMemo<string | null>(() => {
    if (!kernelRawProfile) return 'Vul je geboortedatum en vermogen in Overzicht in zodat we je onttrekking kunnen doorrekenen.'
    if (currentAge === null) return 'Vul je geboortedatum in Overzicht in zodat we je horizon kunnen berekenen.'
    if ((kernelAssets?.length ?? 0) === 0) return 'Voeg vermogen toe in Overzicht om onttrekkingsprofielen te vergelijken.'
    if (yearlyExpenses <= 0) return 'Stel je essentiële uitgaven in zodat we je onttrekking kunnen doorrekenen.'
    return null
  }, [kernelRawProfile, currentAge, kernelAssets, yearlyExpenses])

  const kernelReady = degradedReason === null

  // Synchroniseer de selectie met het actieve profiel zodra dat bekend is.
  useEffect(() => { setSelectedProfiel(activeProfiel) }, [activeProfiel])

  // ── Run kernel-projectie per onttrekkingsprofiel ─────────────────────────
  // Eén rauwe convergentie-context; per profiel één run met een
  // `withdrawal_profile_config.profiel`-override (ZELFDE injectie-patroon als
  // lib/future/regel-sim.ts). GEEN tweede motor / geen eigen herberekening.
  const simulations = useMemo<Record<WithdrawalProfiel, SimResult | null>>(() => {
    const empty: Record<WithdrawalProfiel, SimResult | null> = {
      vast: null, afnemend: null, oplopend: null, guardrails: null,
    }
    if (!kernelReady || !kernelRawProfile) return empty

    const rawCfg =
      kernelRawProfile.withdrawal_profile_config &&
      typeof kernelRawProfile.withdrawal_profile_config === 'object'
        ? (kernelRawProfile.withdrawal_profile_config as Record<string, unknown>)
        : {}

    const baseContext: ConvergentieRawContext = {
      profile: kernelRawProfile,
      assets: kernelAssets ?? [],
      debts: kernelDebts ?? [],
      lifeEvents: kernelLifeEvents ?? [],
      aowRows: kernelAowRows,
      yearlyExpenses,
    }

    const results: Record<string, SimResult | null> = {}
    for (const profiel of ALL_PROFIELEN) {
      const outcome = computeConvergentieProjection({
        rawContext: {
          ...baseContext,
          profile: {
            ...baseContext.profile,
            // Override alléén het profiel; de 3-fasen-curve (go-go/slow-go/no-go)
            // blijft de door de gebruiker ingestelde curve of de Excel-defaults.
            withdrawal_profile_config: { ...rawCfg, profiel },
          },
        },
      })
      results[profiel] = outcome.ok ? toSimResult(outcome.result) : null
    }
    return results as Record<WithdrawalProfiel, SimResult | null>
  }, [kernelReady, kernelRawProfile, kernelAssets, kernelDebts, kernelLifeEvents, kernelAowRows, yearlyExpenses])

  // ── Extract retirement rows for chart ───────────────────────────────────

  const retirementData = useMemo(() => {
    const data: Record<WithdrawalProfiel, SimRow[]> = {
      vast: [],
      afnemend: [],
      oplopend: [],
      guardrails: [],
    }

    for (const profiel of ALL_PROFIELEN) {
      const sim = simulations[profiel]
      if (!sim) continue
      data[profiel] = sim.rows.filter(r => r.phase === 'retirement')
    }

    return data
  }, [simulations])

  // ── Compute chart bounds ────────────────────────────────────────────────

  const chartBounds = useMemo(() => {
    let minAge = Infinity
    let maxAge = -Infinity
    let maxPortfolio = 0

    for (const profiel of ALL_PROFIELEN) {
      const rows = retirementData[profiel]
      if (rows.length === 0) continue
      minAge = Math.min(minAge, rows[0].age)
      maxAge = Math.max(maxAge, rows[rows.length - 1].age)
      for (const row of rows) {
        maxPortfolio = Math.max(maxPortfolio, row.endPortfolio)
      }
    }

    // If no retirement data, use accumulation data to find FIRE age
    if (minAge === Infinity) {
      const anySim = simulations.vast
      if (anySim && anySim.rows.length > 0) {
        minAge = anySim.rows[0].age
        maxAge = anySim.rows[anySim.rows.length - 1].age
        maxPortfolio = Math.max(...anySim.rows.map(r => r.endPortfolio))
      } else {
        minAge = currentAge ?? 30
        maxAge = strategyForSim.endAge
        maxPortfolio = 1_000_000
      }
    }

    return { minAge, maxAge, maxPortfolio }
  }, [retirementData, simulations, currentAge, strategyForSim.endAge])

  // ── Spending flexibility for selected profiel ──────────────────────────

  const spendingRange = useMemo(() => {
    const sim = simulations[selectedProfiel]
    if (!sim) return null

    const retRows = retirementData[selectedProfiel]
    if (retRows.length === 0) return null

    let minWithdrawal = Infinity
    let maxWithdrawal = 0

    for (const row of retRows) {
      if (row.withdrawal > 0) {
        minWithdrawal = Math.min(minWithdrawal, row.withdrawal)
        maxWithdrawal = Math.max(maxWithdrawal, row.withdrawal)
      }
    }

    if (minWithdrawal === Infinity) return null

    return {
      minMonthly: Math.round(minWithdrawal / 12),
      maxMonthly: Math.round(maxWithdrawal / 12),
    }
  }, [simulations, retirementData, selectedProfiel])

  // ── Guardrails corridor data (for shaded area) ─────────────────────────

  const guardrailsCorridor = useMemo(() => {
    if (selectedProfiel !== 'guardrails') return null

    const sim = simulations.guardrails
    if (!sim) return null

    const retRows = retirementData.guardrails
    if (retRows.length === 0) return null

    // Compute floor/ceiling withdrawal amounts per year
    return retRows.map(row => {
      const baseWithdrawal = row.withdrawal
      return {
        age: row.age,
        floor: Math.round(baseWithdrawal * withdrawalConfig.guardrailFloor),
        target: baseWithdrawal,
        ceiling: Math.round(baseWithdrawal * withdrawalConfig.guardrailCeiling),
        portfolio: row.endPortfolio,
      }
    })
  }, [selectedProfiel, simulations, retirementData, withdrawalConfig])

  // ── Life event markers with ages ────────────────────────────────────────

  const eventMarkers = useMemo(() => {
    return lifeEventsRaw
      .filter(e => e.target_age !== null)
      .map(e => ({
        name: e.name,
        age: e.target_age!,
        type: e.event_type,
      }))
      .filter(e => e.age >= chartBounds.minAge && e.age <= chartBounds.maxAge)
  }, [lifeEventsRaw, chartBounds])

  /**
   * ADR 0127 — het bereik onder 'Nu stoppen' voor één doorgerekend profiel.
   * Consume-only: leest `kernelDepletionMonth`/`displayEndAge` uit de run die er
   * al staat; `fireAge` ís onder dit anker de startleeftijd (D1).
   *
   * STAAT BOVEN DE EARLY RETURNS, en dat is geen stijlkeuze: hieronder verlaat
   * het component vroegtijdig bij `loading` en bij `error || !input`. Een hook
   * ná die returns wordt op de laadrender niet aangeroepen en op de render
   * daarna wél — dan wijkt de hook-volgorde af en gooit React "Rendered more
   * hooks than during the previous render". Deze modal heeft een laadtoestand,
   * dus dat raakt elke opening. Zet nieuwe hooks hier, niet verderop.
   */
  const reachVoor = useCallback(
    (sim: SimResult): AnkerReach =>
      ankerReachFromSim({
        // De kernel-tijdas begint op de huidige leeftijd — onder een aow-/age-anker is
        // `fireAge` het anker zelf, dus nooit als startleeftijd gebruiken (F3a).
        startAge: currentAge,
        kernelDepletionMonth: sim.kernelDepletionMonth,
        endAge: sim.displayEndAge,
      }),
    [currentAge],
  )

  // ── Loading state ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <ShellOverlay open={open} onClose={onClose} kind="pane" mobileBackCloses title="Strategieën">
        {/* Outer padding wordt geleverd door SlideInPane (driewegregel — ui-ux skill). */}
        <div>
          <div className="space-y-4">
            <div className="h-8 w-48 animate-pulse rounded-[var(--r)] bg-[var(--subtle)]" />
            <div className="h-4 w-80 animate-pulse rounded-[var(--r)] bg-[var(--subtle)]" />
            <div className="h-64 animate-pulse rounded-[var(--r)] bg-[var(--subtle)]" />
            <div className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="h-24 animate-pulse rounded-[var(--r)] bg-[var(--subtle)]" />
              ))}
            </div>
            <div className="h-48 animate-pulse rounded-[var(--r)] bg-[var(--subtle)]" />
          </div>
          <p className="mt-4 text-center font-sans text-sm text-[var(--ink-3)]">
            Gegevens laden...
          </p>
        </div>
      </ShellOverlay>
    )
  }

  if (error || !input) {
    return (
      <ShellOverlay open={open} onClose={onClose} kind="pane" mobileBackCloses title="Strategieën">
        <div className="flex flex-col items-center text-center py-12 px-4 max-w-md mx-auto">
          <div className="mb-3 flex items-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
            <span
              aria-hidden
              className="inline-block h-px w-7"
              style={{ background: 'var(--module-active-500)' }}
            />
            Strategieën
          </div>
          <h3
            className="font-bold leading-tight text-[20px] sm:text-[24px]"
            style={{ fontFamily: 'var(--font-playfair, serif)' }}
          >
            {error ? (
              <>Laden niet <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>gelukt</em></>
            ) : (
              <>Data nodig voor <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>strategieën</em></>
            )}
          </h3>
          <p
            className="mt-3 italic text-[14px] text-[var(--ink-2)] max-w-prose"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            {error
              ? 'Er is een fout opgetreden. Controleer je verbinding en probeer het opnieuw.'
              : 'Voeg vermogen toe in Overzicht zodat strategieën vergeleken kunnen worden.'}
          </p>
        </div>
      </ShellOverlay>
    )
  }

  const selectedSim = simulations[selectedProfiel]
  const selectedInfo = PROFIEL_INFO[selectedProfiel]
  const fireAge = selectedSim?.fireAge ?? null

  return (
    <ShellOverlay open={open} onClose={onClose} kind="pane" mobileBackCloses title="Strategieën">
      {/* Outer padding wordt geleverd door SlideInPane (driewegregel — ui-ux skill). */}
      <div>

        {/* ── Subtitle + active badges ────────────────────────────── */}
        <header className="mb-4">
          <p className="mt-1 font-sans text-sm text-[var(--ink-3)]">
            Kies je planningshorizon, eindstrategie, eigen-woning-aanpak en onttrekkingsmethode. De combinatie bepaalt hoe je portefeuille zich ontwikkelt na FIRE.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-horizon-300 bg-horizon-50 px-3 py-1.5">
              <span className="font-sans text-[10px] font-medium uppercase tracking-wider text-horizon-500">Stop</span>
              <span className="font-sans text-xs font-semibold text-horizon-700">
                {planDraft.anchor === 'age' && planDraft.stopAge != null
                  ? `Op ${formatPlanAge(planDraft.stopAge)}`
                  : STOP_ANCHOR_OPTIONS.find((o) => o.kind === planDraft.anchor)?.name ?? '—'}
              </span>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-horizon-300 bg-horizon-50 px-3 py-1.5">
              <span className="font-sans text-[10px] font-medium uppercase tracking-wider text-horizon-500">Eind</span>
              <span className="font-sans text-xs font-semibold text-horizon-700">
                {STRATEGY_LABELS[planDraft.endForm].name}
              </span>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-horizon-300 bg-horizon-50 px-3 py-1.5">
              <span className="font-sans text-[10px] font-medium uppercase tracking-wider text-horizon-500">Onttrekking</span>
              <span className="font-sans text-xs font-semibold text-horizon-700">
                {PROFIEL_INFO[activeProfiel].label}
              </span>
            </div>
            {housingStrategy && (
              <div className="inline-flex items-center gap-1.5 rounded-full border border-horizon-300 bg-horizon-50 px-3 py-1.5">
                <span className="font-sans text-[10px] font-medium uppercase tracking-wider text-horizon-500">Eigen woning</span>
                <span className="font-sans text-xs font-semibold text-horizon-700">
                  {HOUSING_STRATEGY_LABELS[housingStrategy.mode]}
                </span>
              </div>
            )}
          </div>
        </header>

        {/* ── Tab-strip: 3 strategie-keuzes ──────────────────────── */}
        <div
          role="tablist"
          aria-label="Strategie-keuzes"
          className="mb-5 flex border-b border-[var(--border-ed)]"
        >
          {([
            { id: 'eind' as const, label: 'Eindstrategie' },
            { id: 'onttrekking' as const, label: 'Onttrekking' },
            { id: 'woning' as const, label: 'Eigen woning' },
          ]).map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-[44px] flex-1 px-3 py-2 text-center text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-b-[3px] border-horizon-500 bg-horizon-50/40 text-horizon-700'
                    : 'border-b-[3px] border-transparent text-[var(--ink-3)] hover:text-[var(--ink-2)]'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* ── Strategy warning (columns not loaded) ────────────────── */}
        {strategyWarning && (
          <div className="mb-4 rounded-[var(--r)] border border-amber-200 bg-amber-50 px-4 py-2">
            <p className="font-sans text-sm text-amber-700">{strategyWarning}</p>
          </div>
        )}

        {/* ── End strategy selection (LEIDEND) ─────────────────────── */}
        {activeTab === 'eind' && (
        <section className="mb-6">
          <div className="card-editorial overflow-hidden">
            <div className="h-[3px] bg-horizon-500" />
            <div className="px-4 py-3">
              <p className="mb-3 font-sans text-xs text-[var(--ink-3)]">
                Twee vragen bepalen je plan: wanneer je stopt, en wat er aan het eind moet gelden.
                Wijzigingen worden bewaard zodra ze kloppen. Dezelfde vragen staan bij{' '}
                <Link href="/toekomst/voorkeuren?regel=eindstrategie" className="font-medium text-horizon-700 underline hover:text-[var(--ink)]">Voorkeuren</Link>.
              </p>

              {/* ADR 0129 B13 — de twee vragen, gespiegeld uit Voorkeuren via hetzelfde
                  component. Het eindleeftijd-veld is onder élk anker zichtbaar; de
                  AOW-toets komt uit de gebruikerstabel (`aowAgeFractional`), niet uit
                  een hardcoded 67 (bevinding 3). */}
              <StopPlanVragen
                compact
                value={planDraft}
                onChange={setPlanDraft}
                errors={planValidatie.errors}
                aowAge={aowAgeFractional}
                currentAge={currentAge}
                solvedFireAge={simulations.vast?.stopAnker == null ? (simulations.vast?.fireAgeFractional ?? null) : null}
                disabled={endStrategySaving}
              />

              {/* Save indicator */}
              {endStrategySaving && (
                <div className="mt-2 flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin text-horizon-500" />
                  <span className="font-sans text-[11px] text-[var(--ink-3)]">Opslaan...</span>
                </div>
              )}
              {endStrategyMessage && (
                <p className={`mt-2 font-sans text-[11px] ${endStrategyMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                  {endStrategyMessage.text}
                </p>
              )}
            </div>
          </div>
        </section>
        )}

        {activeTab === 'onttrekking' && (
        <>
        {degradedReason ? (
          /* Kernel-only: zonder rauwe context of basisgegevens geen doorrekening. */
          <div className="card-editorial overflow-hidden">
            <div className="h-[3px] bg-horizon-500" />
            <div className="flex items-start gap-2.5 px-4 py-4">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-horizon-500" />
              <div>
                <p className="font-sans text-sm font-semibold text-[var(--ink)]">
                  Doorrekening niet beschikbaar
                </p>
                <p className="mt-1 font-sans text-[13px] leading-snug text-[var(--ink-2)]">
                  {degradedReason}
                </p>
              </div>
            </div>
          </div>
        ) : (
        <>
        {/* Kernel-only: read-only informatief profiel-vergelijk. */}
        <div className="mb-4 flex items-start gap-2.5 rounded-[var(--r)] border border-horizon-200 bg-horizon-50/60 px-4 py-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-horizon-500" />
          <p className="font-sans text-[11px] leading-snug text-[var(--ink-2)]">
            Deze vergelijking gebruikt de horizon-kernel. Hieronder vergelijk je de vier
            onttrekkings<strong>profielen</strong> — Vast, Afnemend, Oplopend en Guardrails.
            Dit vergelijk is informatief; je kiest en bewaart je profiel bij{' '}
            <Link href="/toekomst?tab=voorkeuren" className="font-medium text-horizon-700 underline hover:text-[var(--ink)]">Voorkeuren</Link>.
          </p>
        </div>

        {/* ── Onttrekkingsprofiel-label ────────────────────────────── */}
        <p className="mb-3 font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
          Onttrekkingsprofiel
        </p>

        {/* ── Profiel selector cards ──────────────────────────────── */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          {ALL_PROFIELEN.map(profiel => {
            const info = PROFIEL_INFO[profiel]
            const sim = simulations[profiel]
            const isSelected = profiel === selectedProfiel
            // Read-only: markeer het huidig opgeslagen profiel (op /toekomst gekozen).
            const isCurrent = profiel === activeProfiel

            return (
              <button
                key={profiel}
                type="button"
                onClick={() => setSelectedProfiel(profiel)}
                className={`relative rounded-[var(--r)] border-2 p-3 text-left transition-all ${
                  isSelected
                    ? `${info.cardBg} ${info.cardBorder} shadow-sm`
                    : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--border-md)]'
                }`}
              >
                {isCurrent && (
                  <span className="absolute -top-2 right-2 rounded-full bg-horizon-600 px-1.5 py-0.5 font-sans text-[9px] font-bold uppercase tracking-wider text-white">
                    Actief
                  </span>
                )}
                <div className="mb-1 flex items-center gap-1.5">
                  <span style={{ color: info.color }}>{PROFIEL_ICONS[profiel]}</span>
                  <span className="font-sans text-sm font-semibold text-[var(--ink)]">
                    {info.label}
                  </span>
                </div>
                <p className="font-sans text-[11px] leading-snug text-[var(--ink-3)]">
                  {info.description}
                </p>
                {sim && sim.fireReachable && (
                  <p className="mt-2 font-mono text-xs tabular-nums text-[var(--ink-2)]">
                    {/* ADR 0129 — onder een VAST anker (aow/now/age) is `sim.fireAge` het
                        anker zelf en zegt "FIRE: 47 jr" niets. De vraag is hoe ver het
                        vermogen reikt; de sleutel is de kernel-echo `stopAnker`. */}
                    {sim.stopAnker != null
                      ? ankerKort(reachVoor(sim))
                      : `FIRE: ${sim.fireAge} jr`}
                  </p>
                )}
              </button>
            )
          })}
        </div>

        {/* ── Comparison SVG chart ────────────────────────────────── */}
        <section className="mb-6">
          <div className="card-editorial overflow-hidden">
            <div className="h-[3px] bg-horizon-500" />
            <div className="px-4 py-3">
              <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                Portefeuillewaarde na FIRE
              </p>

              {/* Legend */}
              <div className="mb-3 flex flex-wrap items-center gap-3">
                {ALL_PROFIELEN.map(profiel => {
                  const info = PROFIEL_INFO[profiel]
                  const isSelected = profiel === selectedProfiel
                  return (
                    <button
                      key={profiel}
                      type="button"
                      onClick={() => setSelectedProfiel(profiel)}
                      className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 font-sans text-[10px] transition-colors ${
                        isSelected
                          ? 'bg-[var(--subtle)] font-semibold text-[var(--ink)]'
                          : 'text-[var(--ink-4)] hover:text-[var(--ink-3)]'
                      }`}
                    >
                      <svg width="10" height="10" aria-hidden="true">
                        <circle cx="5" cy="5" r="4" fill={info.stroke} opacity={isSelected ? 1 : 0.5} />
                      </svg>
                      {info.label}
                    </button>
                  )
                })}
              </div>

              {/* SVG Chart */}
              <ComparisonChart
                retirementData={retirementData}
                chartBounds={chartBounds}
                selectedProfiel={selectedProfiel}
                eventMarkers={eventMarkers}
                guardrailsCorridor={guardrailsCorridor}
              />
            </div>
          </div>
        </section>

        {/* ── Spending flexibility card ──────────────────────────── */}
        {spendingRange && (
          <section className="mb-6">
            <div className="card-editorial overflow-hidden">
              <div className="px-4 py-3">
                <div className="flex items-start gap-2.5">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-horizon-500" />
                  <div>
                    <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                      Bestedingsruimte ({selectedInfo.label})
                    </p>
                    <p className="mt-1 font-sans text-sm text-[var(--ink)]">
                      Je kunt flexen tussen{' '}
                      <span className="font-mono tabular-nums font-semibold">
                        {<MaskedAmount value={spendingRange.minMonthly} tone="horizon" />}
                      </span>
                      {' '}en{' '}
                      <span className="font-mono tabular-nums font-semibold">
                        {<MaskedAmount value={spendingRange.maxMonthly} tone="horizon" />}
                      </span>
                      {' '}per maand
                    </p>
                    <p className="mt-1 font-sans text-[11px] text-[var(--ink-4)]">
                      {selectedInfo.description}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── Guardrails bandwidth card (conditional) ────────────── */}
        {selectedProfiel === 'guardrails' && guardrailsCorridor && guardrailsCorridor.length > 0 && (
          <section className="mb-6">
            <div className="card-editorial overflow-hidden">
              <div className="h-[3px] bg-blue-400" />
              <div className="px-4 py-3">
                <p className="mb-2 font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                  Guardrails bandbreedte
                </p>
                <GuardrailsBandwidthChart
                  corridor={guardrailsCorridor}
                  chartBounds={chartBounds}
                />
                <div className="mt-2 flex items-center justify-between font-sans text-[10px] text-[var(--ink-4)]">
                  <span>
                    Floor: {Math.round(withdrawalConfig.guardrailFloor * 100)}% van basis
                  </span>
                  <span>
                    Ceiling: {Math.round(withdrawalConfig.guardrailCeiling * 100)}% van basis
                  </span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── Life events timeline ──────────────────────────────── */}
        {eventMarkers.length > 0 && (
          <section className="mb-6">
            <div className="card-editorial overflow-hidden">
              <div className="px-4 py-3">
                <p className="mb-2 font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                  Levensgebeurtenissen op de tijdlijn
                </p>
                <div className="space-y-1.5">
                  {eventMarkers.map((marker, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-[var(--ink-2)]">
                        {marker.age} jr
                      </span>
                      <div className="h-px flex-1 bg-[var(--border-ed)]" />
                      <span className="font-sans text-xs text-[var(--ink)]">
                        {marker.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── Strategy summary ──────────────────────────────────── */}
        {selectedSim && (
          <section className="mb-6">
            <div className="card-editorial overflow-hidden">
              <div className="px-4 py-3">
                <p className="mb-2 font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                  Samenvatting ({selectedInfo.label})
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {/* ADR 0129 D4 — onder een VAST anker: geen FIRE-leeftijd (die is het anker)
                      en geen doelbedrag (de kernel bisecteert op tijd, niet op kapitaal); wél
                      het bereik en het geprojecteerde vermogen op het stopmoment. */}
                  {selectedSim.stopAnker != null ? (
                    <>
                      <SummaryRow
                        label="Stopmoment"
                        value={selectedSim.stopAnker.soort === 'nu' ? 'Nu' : selectedSim.vastStopLeeftijd != null ? `${formatPlanAge(selectedSim.vastStopLeeftijd)} jaar` : '—'}
                      />
                      <SummaryRow
                        label={ANKER_KPI_LABEL}
                        value={ankerReachYear(reachVoor(selectedSim)) != null ? `${ankerReachYear(reachVoor(selectedSim))} jaar` : 'Nog niet te bepalen'}
                      />
                      <SummaryRow label="Vermogen op je stopmoment" value={<MaskedAmount value={selectedSim.firePortfolioAtFire} tone="horizon" />} />
                    </>
                  ) : (
                    <>
                      <SummaryRow label="FIRE leeftijd" value={fireAge !== null ? `${fireAge} jaar` : 'Niet bereikbaar'} />
                      <SummaryRow label="Doelbedrag" value={<MaskedAmount value={selectedSim.requiredFirePortfolio} tone="horizon" />} />
                      <SummaryRow label="Onttrekkingspercentage" value={`${(selectedSim.implicitWithdrawalRate * 100).toFixed(1)}%`} />
                    </>
                  )}
                  <SummaryRow label="Eindvermogen" value={
                    selectedSim.rows.length > 0
                      ? formatCurrency(selectedSim.rows[selectedSim.rows.length - 1].endPortfolio)
                      : '—'
                  } />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── Profielen uitgelegd ──────────────────────────────── */}
        <section className="mb-6">
          <p className="mb-3 font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
            Profielen uitgelegd
          </p>
          <div className="space-y-3">
            {ALL_PROFIELEN.map(profiel => {
              const info = PROFIEL_INFO[profiel]
              const isCurrent = profiel === activeProfiel

              return (
                <div
                  key={profiel}
                  className={`card-editorial overflow-hidden transition-all ${
                    isCurrent ? 'ring-2 ring-horizon-400 ring-offset-1' : ''
                  }`}
                >
                  {/* Colored top accent */}
                  <div className="h-[3px]" style={{ backgroundColor: info.color }} />

                  <div className="px-4 py-3">
                    {/* Header row with icon, name, and active badge */}
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className="flex h-7 w-7 items-center justify-center rounded-md"
                        style={{ backgroundColor: info.color + '18', color: info.color }}
                      >
                        {PROFIEL_ICONS[profiel]}
                      </span>
                      <span className="font-sans text-sm font-bold text-[var(--ink)]">
                        {info.label}
                      </span>
                      {isCurrent && (
                        <span className="ml-auto rounded-full bg-horizon-600 px-2 py-0.5 font-sans text-[9px] font-bold uppercase tracking-wider text-white">
                          Actief
                        </span>
                      )}
                    </div>

                    <p className="font-sans text-xs leading-relaxed text-[var(--ink-2)]">
                      {info.description}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
        </>
        )}
        </>
        )}

        {/* ── Eigen-woning-strategie (kapitaal-input) ─────────────── */}
        {activeTab === 'woning' && (
        <section className="mb-6">
          <div className="card-editorial overflow-hidden">
            <div className="h-[3px] bg-horizon-500" />
            <div className="px-4 py-3">
              <HousingStrategySection />
            </div>
          </div>
        </section>
        )}

        {/* ── Secondary link to full settings (guardrail parameters etc.) ── */}
        <Link
          href="/toekomst?tab=voorkeuren"
          className="flex items-center justify-between rounded-[var(--r)] border-2 border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 transition-all hover:border-horizon-300 hover:shadow-sm"
        >
          <div className="flex items-center gap-2.5">
            <Settings className="h-4 w-4 text-horizon-500" />
            <div>
              <p className="font-sans text-sm font-medium text-[var(--ink)]">
                Geavanceerde instellingen
              </p>
              <p className="font-sans text-[11px] text-[var(--ink-3)]">
                Pas guardrail-parameters en andere opties aan
              </p>
            </div>
          </div>
          <ArrowLeft className="h-4 w-4 rotate-180 text-[var(--ink-4)]" />
        </Link>

        {/* ── Disclaimer ────────────────────────────────────────────── */}
        <p className="pb-8 pt-4 text-center font-sans text-[10px] text-[var(--ink-4)]">
          Dit is een simulatie — geen financieel advies. Werkelijke resultaten kunnen afwijken.
        </p>
      </div>
    </ShellOverlay>
  )
}

// ── Summary row ───────────────────────────────────────────────────────────────

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span className="font-sans text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">{label}</span>
      <p className="font-mono text-sm font-medium tabular-nums text-[var(--ink)]">{value}</p>
    </div>
  )
}

// ── Comparison Chart (SVG) ──────────────────────────────────────────────────

interface ComparisonChartProps {
  retirementData: Record<WithdrawalProfiel, SimRow[]>
  chartBounds: { minAge: number; maxAge: number; maxPortfolio: number }
  selectedProfiel: WithdrawalProfiel
  eventMarkers: Array<{ name: string; age: number; type: string }>
  guardrailsCorridor: Array<{ age: number; floor: number; target: number; ceiling: number; portfolio: number }> | null
}

/** Chart dimensions */
const CHART_W = 640
const CHART_H = 280
const PAD_L = 56
const PAD_R = 16
const PAD_T = 16
const PAD_B = 32

function ComparisonChart({ retirementData, chartBounds, selectedProfiel, eventMarkers, guardrailsCorridor }: ComparisonChartProps) {
  const { minAge, maxAge, maxPortfolio } = chartBounds

  if (maxAge <= minAge || maxPortfolio <= 0) {
    return (
      <div className="flex h-40 items-center justify-center">
        <p className="font-sans text-sm text-[var(--ink-3)]">Geen pensioendata beschikbaar</p>
      </div>
    )
  }

  const plotW = CHART_W - PAD_L - PAD_R
  const plotH = CHART_H - PAD_T - PAD_B
  const ageRange = maxAge - minAge
  const portfolioRange = maxPortfolio * 1.1 // Add 10% headroom

  /** Map age to x coordinate */
  const toX = (age: number) => PAD_L + ((age - minAge) / ageRange) * plotW
  /** Map portfolio value to y coordinate */
  const toY = (value: number) => PAD_T + plotH - (value / portfolioRange) * plotH

  /** Build SVG path string from retirement rows */
  function buildPath(rows: SimRow[]): string {
    if (rows.length === 0) return ''
    return rows.map((row, i) => {
      const x = toX(row.age)
      const y = toY(row.endPortfolio)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
  }

  // Y-axis grid lines (5 steps)
  const ySteps = 5
  const yGridLines = Array.from({ length: ySteps + 1 }, (_, i) => {
    const value = (portfolioRange / ySteps) * i
    return { y: toY(value), value: Math.round(value) }
  })

  // X-axis labels (every 5 years)
  const xLabels: number[] = []
  const startLabel = Math.ceil(minAge / 5) * 5
  for (let age = startLabel; age <= maxAge; age += 5) {
    xLabels.push(age)
  }

  // Draw order: non-selected profielen first, then selected on top
  const drawOrder = ALL_PROFIELEN.filter(s => s !== selectedProfiel)
  drawOrder.push(selectedProfiel)

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      className="w-full"
      aria-label="Vergelijking onttrekkingsprofielen"
    >
      {/* Y-axis grid lines */}
      {yGridLines.map((line, i) => (
        <g key={i}>
          <line
            x1={PAD_L}
            y1={line.y}
            x2={CHART_W - PAD_R}
            y2={line.y}
            stroke="var(--border-ed)"
            strokeWidth="0.5"
          />
          {i > 0 && (
            <text
              x={PAD_L - 6}
              y={line.y + 3}
              textAnchor="end"
              className="fill-[var(--ink-4)]"
              style={{ fontSize: '8px', fontFamily: 'var(--font-mono, monospace)' }}
            >
              {formatCompactValue(line.value)}
            </text>
          )}
        </g>
      ))}

      {/* X-axis labels */}
      {xLabels.map(age => (
        <text
          key={age}
          x={toX(age)}
          y={CHART_H - 6}
          textAnchor="middle"
          className="fill-[var(--ink-4)]"
          style={{ fontSize: '8px', fontFamily: 'var(--font-mono, monospace)' }}
        >
          {age}
        </text>
      ))}

      {/* Life event markers (vertical dashed lines) */}
      {eventMarkers.map((marker, idx) => {
        const x = toX(marker.age)
        return (
          <g key={idx}>
            <line
              x1={x}
              y1={PAD_T}
              x2={x}
              y2={CHART_H - PAD_B}
              stroke="var(--ink-4)"
              strokeWidth="0.5"
              strokeDasharray="3,3"
              opacity="0.6"
            />
            <text
              x={x}
              y={PAD_T - 4}
              textAnchor="middle"
              className="fill-[var(--ink-4)]"
              style={{ fontSize: '7px', fontFamily: 'var(--font-sans, sans-serif)' }}
            >
              {marker.name}
            </text>
          </g>
        )
      })}

      {/* Guardrails shaded corridor (when selected) */}
      {selectedProfiel === 'guardrails' && guardrailsCorridor && guardrailsCorridor.length > 1 && (
        <path
          d={buildGuardrailsArea(guardrailsCorridor, toX, toY)}
          fill="#3b82f6"
          opacity="0.08"
        />
      )}

      {/* Profiel lines */}
      {drawOrder.map(profiel => {
        const rows = retirementData[profiel]
        if (rows.length === 0) return null
        const info = PROFIEL_INFO[profiel]
        const isSelected = profiel === selectedProfiel

        return (
          <path
            key={profiel}
            d={buildPath(rows)}
            fill="none"
            stroke={info.stroke}
            strokeWidth={isSelected ? 2.5 : 1.5}
            opacity={isSelected ? 1 : 0.35}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )
      })}

      {/* Zero line */}
      <line
        x1={PAD_L}
        y1={toY(0)}
        x2={CHART_W - PAD_R}
        y2={toY(0)}
        stroke="var(--ink-3)"
        strokeWidth="0.5"
        opacity="0.4"
      />
    </svg>
  )
}

/** Build a closed SVG area path for guardrails corridor based on portfolio values */
function buildGuardrailsArea(
  corridor: Array<{ age: number; portfolio: number }>,
  toX: (age: number) => number,
  toY: (value: number) => number,
): string {
  if (corridor.length < 2) return ''

  // Upper boundary: portfolio * 1.1 (ceiling band approximation)
  const upperPoints = corridor.map(c => `${toX(c.age).toFixed(1)},${toY(c.portfolio * 1.1).toFixed(1)}`)
  // Lower boundary: portfolio * 0.9 (floor band approximation)
  const lowerPoints = [...corridor].reverse().map(c => `${toX(c.age).toFixed(1)},${toY(c.portfolio * 0.9).toFixed(1)}`)

  return `M${upperPoints.join(' L')} L${lowerPoints.join(' L')} Z`
}

/** Format a value compactly for y-axis labels (e.g. 1.2M, 500K) */
function formatCompactValue(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`
  return String(Math.round(value))
}

// ── Guardrails Bandwidth Chart ────────────────────────────────────────────

interface GuardrailsBandwidthChartProps {
  corridor: Array<{ age: number; floor: number; target: number; ceiling: number }>
  chartBounds: { minAge: number; maxAge: number }
}

const GR_CHART_H = 160

// ── Guardrails Bandwidth Chart ────────────────────────────────────────────

function GuardrailsBandwidthChart({ corridor, chartBounds }: GuardrailsBandwidthChartProps) {
  const { minAge, maxAge } = chartBounds

  if (corridor.length < 2) {
    return <p className="font-sans text-sm text-[var(--ink-3)]">Onvoldoende data</p>
  }

  // Find max withdrawal for scaling
  let maxVal = 0
  for (const c of corridor) {
    maxVal = Math.max(maxVal, c.ceiling)
  }
  const yRange = maxVal * 1.15

  const plotW = CHART_W - PAD_L - PAD_R
  const plotH = GR_CHART_H - PAD_T - PAD_B
  const ageRange = maxAge - minAge || 1

  const toX = (age: number) => PAD_L + ((age - minAge) / ageRange) * plotW
  const toY = (val: number) => PAD_T + plotH - (val / yRange) * plotH

  // Build corridor area (ceiling -> floor)
  const ceilingPts = corridor.map(c => `${toX(c.age).toFixed(1)},${toY(c.ceiling).toFixed(1)}`)
  const floorPts = [...corridor].reverse().map(c => `${toX(c.age).toFixed(1)},${toY(c.floor).toFixed(1)}`)
  const areaPath = `M${ceilingPts.join(' L')} L${floorPts.join(' L')} Z`

  // Target line
  const targetPath = corridor.map((c, i) =>
    `${i === 0 ? 'M' : 'L'}${toX(c.age).toFixed(1)},${toY(c.target).toFixed(1)}`
  ).join(' ')

  // Y grid
  const ySteps = 4
  const yGrid = Array.from({ length: ySteps + 1 }, (_, i) => {
    const val = (yRange / ySteps) * i
    return { y: toY(val), value: Math.round(val) }
  })

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${GR_CHART_H}`}
      className="w-full"
      aria-label="Guardrails bandbreedte"
    >
      {/* Y grid */}
      {yGrid.map((line, i) => (
        <g key={i}>
          <line x1={PAD_L} y1={line.y} x2={CHART_W - PAD_R} y2={line.y} stroke="var(--border-ed)" strokeWidth="0.5" />
          {i > 0 && (
            <text
              x={PAD_L - 6}
              y={line.y + 3}
              textAnchor="end"
              className="fill-[var(--ink-4)]"
              style={{ fontSize: '8px', fontFamily: 'var(--font-mono, monospace)' }}
            >
              {formatCompactValue(line.value)}
            </text>
          )}
        </g>
      ))}

      {/* Shaded corridor */}
      <path d={areaPath} fill="#3b82f6" opacity="0.12" />

      {/* Ceiling line (dashed) */}
      <path
        d={corridor.map((c, i) => `${i === 0 ? 'M' : 'L'}${toX(c.age).toFixed(1)},${toY(c.ceiling).toFixed(1)}`).join(' ')}
        fill="none"
        stroke="#3b82f6"
        strokeWidth="1"
        strokeDasharray="4,3"
        opacity="0.5"
      />

      {/* Floor line (dashed) */}
      <path
        d={corridor.map((c, i) => `${i === 0 ? 'M' : 'L'}${toX(c.age).toFixed(1)},${toY(c.floor).toFixed(1)}`).join(' ')}
        fill="none"
        stroke="#3b82f6"
        strokeWidth="1"
        strokeDasharray="4,3"
        opacity="0.5"
      />

      {/* Target line (solid) */}
      <path d={targetPath} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" />

      {/* Labels */}
      {corridor.length > 0 && (
        <>
          <text
            x={CHART_W - PAD_R + 2}
            y={toY(corridor[corridor.length - 1].ceiling) + 3}
            className="fill-blue-400"
            style={{ fontSize: '7px', fontFamily: 'var(--font-sans, sans-serif)' }}
          >
            plafond
          </text>
          <text
            x={CHART_W - PAD_R + 2}
            y={toY(corridor[corridor.length - 1].floor) + 3}
            className="fill-blue-400"
            style={{ fontSize: '7px', fontFamily: 'var(--font-sans, sans-serif)' }}
          >
            vloer
          </text>
        </>
      )}
    </svg>
  )
}
