'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, BarChart3, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BudgetIcon } from '@/components/app/budget-shared'
import { MaskedAmount } from '@/components/app/masked-amount'
import {
  type Debt,
  type DebtType,
  type PayoffStrategy,
  DEBT_TYPE_LABELS,
  DEBT_TYPE_ICONS,
  DEBT_TYPE_COLORS,
} from '@/lib/debt-data'
import type { Asset } from '@/lib/asset-data'
import { usePerspective, usePerspectiveAbort } from '@/components/app/perspective-provider'
import { usePartnerPrivacy, PrivacyHiddenNotice } from '@/components/app/privacy-hidden-notice'
import { DebtPayoffStrategy } from '@/components/core/deepenings/debt-payoff-strategy'
import { OVERLAY_QUERY_KEYS } from '@/lib/navigation'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'

// Detail-flow draait via `<DebtPane>` — dezelfde slide-in pane als op
// `/core/debts/[type]`. URL-driven via `?debt=<id>` zodat deeplinks en
// browser-back symmetrisch werken met de categorie-pagina's.
import type { Valuation } from '@/components/app/core/debts/debt-types'
import { DebtPane } from '@/components/app/core/debts/debt-pane'
import { ValuationModal as DebtValuationModal } from '@/components/app/core/debts/debt-valuation-modal'
import { QuickAddWizard } from '@/components/app/quick-add-wizard/quick-add-wizard'
import { EmptyState as QuickAddEmptyState } from '@/components/app/quick-add-wizard/empty-state'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { VermogenDebtCard } from '@/components/core/vermogen-debt-card'
import { AddCategoryCard } from '@/components/core/add-category-card'
import { Kicker, EditorialHeadline, EditorialDeck, FiguresStrip } from '@/components/editorial'
import { loadEntitySparklines } from '@/lib/load-entity-sparklines'
import { buildKpiContext } from '@/lib/kpi-context'
import { computeDebtKpi } from '@/lib/debt-kpi'
import type { KpiPair } from '@/lib/asset-kpi'

// ── Types ───────────────────────────────────────────────────

const DEBT_ITEM_NOUN: Record<DebtType, string> = {
  mortgage: 'hypotheek',
  personal_loan: 'lening',
  student_loan: 'studielening',
  car_loan: 'autolening',
  credit_card: 'creditcard',
  revolving_credit: 'krediet',
  payment_plan: 'regeling',
  belastingschuld: 'belastingschuld',
  familielening: 'familielening',
  dga_schuld: 'DGA-schuld',
  other: 'schuld',
}

function addDebtCta(type: DebtType): string {
  return `Voeg ${DEBT_ITEM_NOUN[type]} toe`
}

// ── Component ───────────────────────────────────────────────

/**
 * `/core/debts` — registratie-overzicht van schulden.
 *
 * Dezelfde structuur als `/core/assets`: hero met totaal en aantal,
 * gegroepeerd per `debt_type` met klikbare type-headers die door-linken
 * naar `/core/debts/[type]`. Klikken op een individuele schuld opent het
 * bestaande detail-modal-patroon.
 *
 * Bewust géén aflossingsstrategie, freedom-time of Box 3-content meer in
 * dit overzicht — die noise is verhuisd naar dedicated pagina's. De Kern
 * is een registratie-fundament, niet een berekenings-tool.
 */
export default function DebtsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // URL-driven pane-state: `?debt=<id>` opent de slide-in pane voor die
  // schuld. Consistent met `/core/debts/[type]` (debt-category-page.tsx).
  const requestedDebtId = searchParams.get('debt')
  // URL-driven strategie-keuze voor de "Schuldenprofiel & Aflosroute"-kaart.
  // Deeplink-vriendelijk en symmetrisch met `?debt=...` — een geldige waarde
  // valt direct in de juiste segmented-control. Onbekende waarden vallen
  // terug op `avalanche` (bespaart de meeste rente per simulatie).
  const requestedStrategie = searchParams.get(OVERLAY_QUERY_KEYS.strategie)

  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAddInitialType, setQuickAddInitialType] = useState<DebtType | null>(null)
  const [debts, setDebts] = useState<Debt[]>([])
  const [valuationsByDebtId, setValuationsByDebtId] = useState<Record<string, Valuation[]>>({})
  const [userAssets, setUserAssets] = useState<Asset[]>([])
  // Per-debt sparkline-historie (12 maanden) voor de breuklijn-overlay op
  // VermogenDebtCard. Zelfde shape als asset-categorie-pagina.
  const [debtSparklines, setDebtSparklines] = useState<Record<string, number[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Aflosroute-kaart open/dicht. Gesloten by default zodat de pagina rustig
  // start; gebruiker klapt 'm open zodra ze de strategie willen verkennen.
  const [aflosrouteOpen, setAflosrouteOpen] = useState(false)
  const { masked } = useMaskedAmounts()
  const fc = useCallback((v: number) => formatMaskedCurrency(v, masked), [masked])

  const { perspective } = usePerspective()
  const perspectiveSignal = usePerspectiveAbort(perspective)
  const { hiddenCategories } = usePartnerPrivacy()

  // ── Data laden ─────────────────────────────────────────────

  const loadDebts = useCallback(async (signal?: AbortSignal) => {
    try {
      const supabase = createClient()
      let query = supabase
        .from('debts')
        .select('*')
      if (perspective === 'personal') {
        query = query.eq('ownership', 'personal')
      }
      const { data, error: fetchError } = await query.order('sort_order', { ascending: true })

      if (signal?.aborted) return
      if (fetchError) throw fetchError

      if (!data || data.length === 0) {
        setDebts([])
        setLoading(false)
        return
      }

      // Privacy-filter in household-modus (Feature #537) — partners die
      // hun schulden hebben verborgen blijven onzichtbaar voor de huidige
      // user-perspective.
      let filteredData = data as Debt[]
      if (perspective === 'household') {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (signal?.aborted) return
          if (user) {
            const ppRes = await fetch('/api/household/partner-privacy')
            if (ppRes.ok) {
              const ppData = await ppRes.json()
              if (ppData.partnerPrivacy?.debts === 'hidden') {
                filteredData = filteredData.filter(
                  d => d.user_id === user.id || d.ownership === 'shared'
                )
              }
            }
          }
        } catch { /* non-critical */ }
      }
      setDebts(filteredData)
    } catch (err) {
      console.error('Error loading debts:', err)
      if (!signal?.aborted) setError('Kon schulden niet laden. Probeer het opnieuw.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [perspective])

  // Lazy-load valuations zodra een specifieke schuld geselecteerd wordt —
  // pane gebruikt dit voor de waarde-historie sectie.
  const loadValuations = useCallback(async (debtId: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('valuations')
      .select('*')
      .eq('entity_id', debtId)
      .eq('entity_type', 'debt')
      .order('valuation_date', { ascending: false })
      .limit(20)
    if (data) {
      setValuationsByDebtId((prev) => ({ ...prev, [debtId]: data as Valuation[] }))
    }
  }, [])

  const loadUserAssets = useCallback(async () => {
    const supabase = createClient()
    // KPI-context heeft `current_value` + `linked_asset_id` nodig voor LTV
    // op hypotheken. Zonder die velden kan `buildKpiContext` geen
    // linkedAssetValueByDebtId opbouwen en blijft de LTV-KPI leeg.
    const { data } = await supabase
      .from('assets')
      .select('id, name, asset_type, current_value, linked_asset_id, is_active')
      .eq('is_active', true)
      .order('name')
    if (data) setUserAssets(data as Asset[])
  }, [])

  useEffect(() => {
    const signal = perspectiveSignal
    loadDebts(signal)
    loadUserAssets()
  }, [loadDebts, loadUserAssets, perspectiveSignal])

  // ── Per-debt sparklines voor de cards-grid ──────────────────
  // Eén batched query op `balance_snapshots` zodra debts geladen zijn.
  // Failure is non-fataal: lege map → kaarten zonder breuklijn-overlay.
  useEffect(() => {
    const activeDebtIds = debts
      .filter((d) => d.is_active && Number(d.current_balance) > 0)
      .map((d) => d.id)
    if (activeDebtIds.length === 0) {
      setDebtSparklines({})
      return
    }
    const supabase = createClient()
    let cancelled = false
    loadEntitySparklines(supabase, 'debt', activeDebtIds)
      .then((sparklines) => { if (!cancelled) setDebtSparklines(sparklines) })
      .catch(() => { if (!cancelled) setDebtSparklines({}) })
    return () => { cancelled = true }
  }, [debts])

  // ── Pane-state setters ─────────────────────────────────────

  // URL-state setter — opent/sluit de pane via shallow route-replace zodat
  // deeplinks deelbaar zijn en browser-back de pane sluit zonder van pagina
  // te wisselen. Optionele `editMode` zet `edit=1` voor één-klik bewerken
  // vanaf de kaart. Bij sluiten (`id === null`) worden alle keys gestript.
  const setSelectedDebtId = useCallback(
    (id: string | null, editMode = false) => {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('edit')
      if (id) {
        params.set('debt', id)
        if (editMode) params.set('edit', '1')
      } else {
        params.delete('debt')
      }
      const queryString = params.toString()
      router.replace(`/core/debts${queryString ? `?${queryString}` : ''}`, { scroll: false })
    },
    [router, searchParams],
  )

  // Valideer de URL-waarde tegen de bekende strategie-set. Onbekende of
  // ontbrekende waarden vallen terug op `avalanche` (default in de engine).
  const VALID_STRATEGIES: readonly PayoffStrategy[] = useMemo(
    () => ['snowball', 'avalanche', 'highest_balance', 'custom'] as const,
    [],
  )
  const strategieFromUrl: PayoffStrategy = useMemo(() => {
    if (
      requestedStrategie &&
      (VALID_STRATEGIES as readonly string[]).includes(requestedStrategie)
    ) {
      return requestedStrategie as PayoffStrategy
    }
    return 'avalanche'
  }, [requestedStrategie, VALID_STRATEGIES])

  // URL-sync voor de strategie-keuze. We schrijven alleen wanneer de waarde
  // verandert om history-vervuiling te voorkomen. `avalanche` (default) komt
  // niet in de URL terecht — net als andere "default"-states blijft de URL
  // dan kort.
  const setStrategieInUrl = useCallback(
    (s: PayoffStrategy) => {
      const params = new URLSearchParams(searchParams.toString())
      if (s === 'avalanche') {
        params.delete(OVERLAY_QUERY_KEYS.strategie)
      } else {
        params.set(OVERLAY_QUERY_KEYS.strategie, s)
      }
      const queryString = params.toString()
      router.replace(`/core/debts${queryString ? `?${queryString}` : ''}`, { scroll: false })
    },
    [router, searchParams],
  )

  // Auto-open de kaart wanneer de gebruiker via deeplink `?strategie=…` arriveert
  // — anders zou de query-param opnieuw moeten worden geactiveerd met een klik.
  useEffect(() => {
    if (requestedStrategie) setAflosrouteOpen(true)
  }, [requestedStrategie])

  // Geselecteerde debt = lookup uit lijst o.b.v. URL-state.
  const selectedDebt = useMemo(
    () => debts.find((d) => d.id === requestedDebtId) ?? null,
    [debts, requestedDebtId],
  )

  // Lazy-load valuations zodra een schuld via URL-state geselecteerd wordt —
  // de pane heeft de waarde-historie nodig voor de view-mode-charts.
  useEffect(() => {
    if (!selectedDebt) return
    if (valuationsByDebtId[selectedDebt.id]) return
    loadValuations(selectedDebt.id)
  }, [selectedDebt, valuationsByDebtId, loadValuations])

  function openDebtModal(debt: Debt) {
    setSelectedDebtId(debt.id)
  }

  // Direct revaluation-target — gezet door de "Saldo bijwerken"-knop op een
  // kaart. Opent uitsluitend de ValuationModal (sheet), zonder eerst de
  // detail-pane.
  const [revalueDebt, setRevalueDebt] = useState<Debt | null>(null)

  // Snelle acties vanuit de kaart-actie-rij. Bewerken opent de detail-pane
  // direct in edit-mode; Saldo bijwerken opent ALLEEN de ValuationModal als
  // sibling-sheet, zonder de pane ertussen.
  const handleDebtEdit = useCallback(
    (debtId: string) => setSelectedDebtId(debtId, true),
    [setSelectedDebtId],
  )
  const handleDebtRevalue = useCallback(
    (debtId: string) => {
      const debt = debts.find((d) => d.id === debtId)
      if (debt) setRevalueDebt(debt)
    },
    [debts],
  )

  // ── Afgeleide waarden ──────────────────────────────────────

  const activeDebts = debts.filter((d) => d.is_active && Number(d.current_balance) > 0)
  const totalBalance = activeDebts.reduce((s, d) => s + Number(d.current_balance), 0)
  const totalMonthlyPayment = activeDebts.reduce((s, d) => s + Number(d.monthly_payment ?? 0), 0)
  // Gewogen gemiddelde rente — met current_balance als weegfactor, zodat
  // grote hypotheken zwaarder meetellen dan een kleine creditcard.
  const weightedAvgInterest = totalBalance > 0
    ? activeDebts.reduce((s, d) => s + Number(d.interest_rate ?? 0) * Number(d.current_balance), 0) / totalBalance
    : 0

  // Group by type — analoog aan `assets-client.tsx` (regel 250-261)
  const byType = (Object.keys(DEBT_TYPE_LABELS) as DebtType[]).reduce(
    (acc, type) => {
      const items = activeDebts.filter(d => d.debt_type === type)
      acc[type] = {
        debts: items,
        total: items.reduce((s, d) => s + Number(d.current_balance), 0),
      }
      return acc
    },
    {} as Record<DebtType, { debts: Debt[]; total: number }>,
  )

  // ── KPI's per schuld (zelfde patroon als debt-category-page) ──
  // userAssets levert linked_asset_id + current_value voor mortgage LTV.
  // computeDebtKpi heeft alleen DebtKpiContext nodig.
  const kpiByDebtId = useMemo(() => {
    const ctx = buildKpiContext({
      assets: userAssets.map((a) => ({
        id: a.id,
        asset_type: a.asset_type,
        current_value: Number(a.current_value ?? 0),
        linked_asset_id: a.linked_asset_id ?? null,
      })),
      debts: activeDebts.map((d) => ({
        id: d.id,
        debt_type: d.debt_type,
        current_balance: Number(d.current_balance),
        linked_asset_id: d.linked_asset_id ?? null,
      })),
      holdings: [],
    }).debt
    const map = new Map<string, KpiPair>()
    for (const debt of activeDebts) {
      const pair = computeDebtKpi(debt, ctx)
      if (pair.primary || pair.secondary) {
        map.set(debt.id, pair)
      }
    }
    return map
  }, [activeDebts, userAssets])

  // ── Rendering ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12">
        <div className="rounded-[var(--r-lg)] border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-700">{error}</p>
          <button
            onClick={() => { setError(null); setLoading(true); loadDebts() }}
            className="mt-3 rounded-[var(--r)] bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Opnieuw proberen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      <NavStackMeta title="Schulden" bottomBar={{ kind: 'tabs' }} />

      {/* ═══ Editorial header (Type 2 — List) ═══════════════════════
          Hergebruikt editorial-primitives: Kicker, EditorialHeadline,
          EditorialDeck, FiguresStrip. Geen hand-rolled markup. */}

      {/* 3px module-accent-bar */}
      <div className="h-[3px] w-full mb-5" style={{ background: 'var(--module-active-500)' }} aria-hidden="true" />

      <header className="mb-5 space-y-3">
        <Kicker size="large">Schulden · vrijheid die je terugkoopt</Kicker>

        <EditorialHeadline emphasis="terugkoopt" size="lg">
          Vrijheid die je terugkoopt
        </EditorialHeadline>

        <EditorialDeck>
          Elke schuld is een claim op je toekomst. Door af te lossen koop je vrijheid terug — euro voor euro,
          maand na maand.
        </EditorialDeck>

        {perspective === 'household' && hiddenCategories.includes('debts') && (
          <PrivacyHiddenNotice hiddenCategories={hiddenCategories} forCategories={['debts']} />
        )}
      </header>

      {/* Figures-strip (mini-hero) — Type 2 blueprint sectie 2 */}
      <FiguresStrip
        cols={4}
        figures={[
          {
            kicker: 'Totale schuld',
            amount: <MaskedAmount value={totalBalance} tone="kern" />,
            sub: `${activeDebts.length} schuld${activeDebts.length !== 1 ? 'en' : ''}`,
            variant: 'winner',
          },
          {
            kicker: 'Maandlasten',
            amount: <MaskedAmount value={totalMonthlyPayment} tone="kern" />,
            sub: 'per maand aflossen',
          },
          {
            kicker: 'Rente (gewogen)',
            amount: `${weightedAvgInterest.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`,
            sub: 'gemiddeld per jaar',
          },
          {
            kicker: 'Categorieën',
            amount: `${(Object.keys(byType) as DebtType[]).filter((t) => byType[t]?.debts.length > 0).length}`,
            sub: `type${(Object.keys(byType) as DebtType[]).filter((t) => byType[t]?.debts.length > 0).length === 1 ? '' : 's'} schuld`,
          },
        ]}
      />

      {/* Schuldenprofiel & Aflosroute — collapsible card.
          Spiegelbeeld van de "Verdeling & Projectie"-kaart op /core/assets
          (zie components/core/assets-client.tsx). Embed `<DebtPayoffStrategy>`
          met 4-strategie segmented control + extra-aflos-slider. Strategie-
          keuze persist via `?strategie=…` (zie OVERLAY_QUERY_KEYS) zodat
          deeplinks deelbaar zijn. */}
      {activeDebts.length > 0 && (
        <div className="mt-3 sm:mt-6 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s0)] overflow-hidden">
          {/* ── Accent bar ── */}
          <div className="h-[3px] w-full bg-kern-500" />

          {/* ── Header (clickable toggle) ── */}
          <button
            type="button"
            onClick={() => setAflosrouteOpen((v) => !v)}
            aria-expanded={aflosrouteOpen}
            className="flex w-full items-center gap-3 border-b border-[var(--border-ed)] px-4 py-4 text-left transition-colors hover:bg-[var(--subtle)] sm:px-5"
          >
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform duration-200 ${aflosrouteOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
            <div className="flex min-w-0 flex-1 items-center justify-between">
              <Kicker>
                <BarChart3 className="h-3 w-3 -mt-0.5 inline mr-1" aria-hidden="true" />
                Schuldenprofiel &amp; Aflosroute
              </Kicker>
              <p className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                {fc(totalBalance)}
              </p>
            </div>
          </button>

          {/* ── Content ── */}
          {aflosrouteOpen && (
            <div className="p-4 sm:p-6">
              <DebtPayoffStrategy
                debts={activeDebts}
                initialStrategy={strategieFromUrl}
                kicker="Aflosroute"
                onStrategyChange={setStrategieInUrl}
              />
            </div>
          )}
        </div>
      )}

      {/* Toolbar — primaire CTA rechts, voor de cards */}
      <div className="flex items-center justify-end mb-5 mt-5 sm:mt-6">
        <button
          type="button"
          onClick={() => { setQuickAddInitialType(null); setQuickAddOpen(true) }}
          aria-label="Schuld toevoegen"
          className="inline-flex min-h-[40px] items-center gap-2 border border-[var(--ink)] bg-[var(--paper)] px-4 py-2 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Schuld toevoegen
        </button>
      </div>

      {/* ═══ Grid per debt-categorie ════════════════════════════
          Zelfde layout als /core/debts/[type] items-tab: per categorie een
          grid van VermogenDebtCard + één AddCategoryCard die de QuickAddWizard
          opent met dat debt-type voor-geselecteerd. */}
      <section className="mt-3 sm:mt-6 space-y-6" data-testid="debt-list-section">
        {activeDebts.length === 0 && (
          <QuickAddEmptyState intent="debt" onAdd={() => setQuickAddOpen(true)} />
        )}

        {(Object.keys(DEBT_TYPE_LABELS) as DebtType[]).map((type) => {
          const group = byType[type]
          if (!group || group.debts.length === 0) return null

          const groupColor = DEBT_TYPE_COLORS[type]
          const groupIcon = DEBT_TYPE_ICONS[type] ?? 'CircleDot'

          return (
            <div key={type}>
              {/* Group header — altijd klikbaar door naar /core/debts/[type] */}
              <div className="flex items-center gap-2 pt-2 pb-2.5">
                <span style={{ color: groupColor }}>
                  <BudgetIcon name={groupIcon} className="h-4 w-4" />
                </span>
                <Link
                  href={`/core/debts/${type}`}
                  className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] hover:text-kern-600 transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kern-500"
                >
                  {DEBT_TYPE_LABELS[type]}
                </Link>
                <span className="text-[var(--ink-3)]">
                  <MaskedAmount value={group.total} tone="kern" className="text-xs" />
                </span>
              </div>

              {/* Debt cards — zelfde grid + cards als /core/debts/[type].
                  KPI-strip + sparkline-overlay worden door VermogenDebtCard
                  zelf gerenderd zodra de props aanwezig zijn. */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.debts.map((debt, idx) => (
                  <VermogenDebtCard
                    key={debt.id}
                    debt={debt}
                    kpiPair={kpiByDebtId.get(debt.id)}
                    sparklineValues={debtSparklines[debt.id]}
                    onClick={() => openDebtModal(debt)}
                    onEditClick={handleDebtEdit}
                    onRevalueClick={handleDebtRevalue}
                    staggerIndex={idx}
                  />
                ))}
                <AddCategoryCard
                  label={addDebtCta(type)}
                  onClick={() => { setQuickAddInitialType(type); setQuickAddOpen(true) }}
                  variant="debt"
                  shape="item"
                  staggerIndex={group.debts.length}
                  ariaLabel={`Voeg item toe aan ${DEBT_TYPE_LABELS[type]}`}
                />
              </div>
            </div>
          )
        })}
      </section>

      {/* ═══ Detail-pane — uniforme slide-in flow (driewegregel kind="pane")
          Zelfde pane als op `/core/debts/[type]` zodat klikken op een
          debt-card geen page-navigatie meer triggert maar de detail/edit/
          revaluatie ter plekke opent. */}
      <DebtPane
        debt={selectedDebt}
        valuations={selectedDebt ? valuationsByDebtId[selectedDebt.id] : undefined}
        userAssets={userAssets}
        allDebts={debts}
        dailyExpenses={0}
        onClose={() => setSelectedDebtId(null)}
        onChanged={() => {
          loadDebts()
          if (selectedDebt) loadValuations(selectedDebt.id)
          router.refresh()
        }}
      />

      {/* Direct saldo-bijwerken — geopend door de "Saldo bijwerken"-knop op
          een kaart. Sibling sheet (driewegregel kind="sheet"): single-form,
          retour-context behouden. Slaat de detail-pane bewust over zodat
          één klik direct in de invoer-modal landt. */}
      {revalueDebt && (
        <DebtValuationModal
          entityId={revalueDebt.id}
          entityType="debt"
          entityName={revalueDebt.name}
          entitySubtype={revalueDebt.debt_type}
          netWorthInclusionPct={revalueDebt.net_worth_inclusion_pct ?? 100}
          currentValue={Number(revalueDebt.current_balance)}
          onClose={() => setRevalueDebt(null)}
          onSaved={() => {
            setRevalueDebt(null)
            loadDebts()
            if (selectedDebt) loadValuations(selectedDebt.id)
            router.refresh()
          }}
        />
      )}

      <QuickAddWizard
        open={quickAddOpen}
        onClose={() => { setQuickAddOpen(false); setQuickAddInitialType(null) }}
        initialIntent="debt"
        initialDebtType={quickAddInitialType ?? undefined}
        onSaved={() => router.refresh()}
      />
    </div>
  )
}
