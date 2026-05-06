'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BudgetIcon } from '@/components/app/budget-shared'
import { MaskedAmount } from '@/components/app/masked-amount'
import {
  type Debt,
  type DebtType,
  DEBT_TYPE_LABELS,
  DEBT_TYPE_ICONS,
  DEBT_TYPE_COLORS,
} from '@/lib/debt-data'
import type { Asset } from '@/lib/asset-data'
import { usePerspective, usePerspectiveAbort } from '@/components/app/perspective-provider'
import { usePartnerPrivacy, PrivacyHiddenNotice } from '@/components/app/privacy-hidden-notice'

// Detail-modal flow blijft bestaan — registratie-overzicht is slechts de
// nieuwe schil. De volledige debt-detail/edit/revaluatie-pijplijn leeft nog
// steeds in dezelfde shared modal-componenten.
import type { Valuation } from '@/components/app/core/debts/debt-types'
import { DebtDetailModal } from '@/components/app/core/debts/debt-detail-modal'
import { DebtForm } from '@/components/app/core/debts/debt-form'
import { ValuationModal } from '@/components/app/core/debts/debt-valuation-modal'
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

type ModalStep = 'detail' | 'edit' | 'revalue'

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

  // De /core/debts/[type] pagina linkt detail-clicks via `?debt=<id>` terug
  // naar deze overzichtspagina. We respecteren die query-param en openen
  // direct het juiste modal — zo blijft de bestaande deep-link werkend.
  const initialDebtId = searchParams.get('debt') ?? undefined

  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAddInitialType, setQuickAddInitialType] = useState<DebtType | null>(null)
  const [debts, setDebts] = useState<Debt[]>([])
  const [valuations, setValuations] = useState<Record<string, Valuation[]>>({})
  const [userAssets, setUserAssets] = useState<Asset[]>([])
  // Per-debt sparkline-historie (12 maanden) voor de breuklijn-overlay op
  // VermogenDebtCard. Zelfde shape als asset-categorie-pagina.
  const [debtSparklines, setDebtSparklines] = useState<Record<string, number[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null)
  const [modalStep, setModalStep] = useState<ModalStep>('detail')

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
      setValuations((prev) => ({ ...prev, [debtId]: data as Valuation[] }))
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

  // ── Detail-modal openen vanuit deep-link ───────────────────

  useEffect(() => {
    if (!initialDebtId || loading || debts.length === 0) return
    const found = debts.find(d => d.id === initialDebtId)
    if (found) {
      setSelectedDebt(found)
      setModalStep('detail')
      loadValuations(found.id)
    }
  }, [initialDebtId, loading, debts, loadValuations])

  // ── Acties ─────────────────────────────────────────────────

  function openDebtModal(debt: Debt) {
    setSelectedDebt(debt)
    setModalStep('detail')
    loadValuations(debt.id)
  }

  function closeDebtModal() {
    setSelectedDebt(null)
    setModalStep('detail')
    // Verwijder de `?debt=` query param zonder navigatie/page-reload zodat
    // browser-back niet onverwachts terug naar de modal-state springt.
    if (initialDebtId) {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('debt')
      const qs = params.toString()
      router.replace(`/core/debts${qs ? `?${qs}` : ''}`, { scroll: false })
    }
  }

  async function deleteDebt(id: string) {
    const supabase = createClient()
    await supabase.from('debts').delete().eq('id', id)
    setDebts((prev) => prev.filter((d) => d.id !== id))
    closeDebtModal()
  }

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

      {/* Toolbar — primaire CTA rechts, voor de cards */}
      <div className="flex items-center justify-end mb-5">
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

      {/* ═══ Modals — bestaand detail-modal patroon blijft ═══════ */}

      {selectedDebt && modalStep === 'detail' && (
        <DebtDetailModal
          debt={selectedDebt}
          valuations={valuations[selectedDebt.id]}
          userAssets={userAssets}
          dailyExpenses={0}
          onClose={closeDebtModal}
          onEdit={() => setModalStep('edit')}
          onRevalue={() => setModalStep('revalue')}
          onDelete={() => deleteDebt(selectedDebt.id)}
        />
      )}

      {selectedDebt && modalStep === 'edit' && (
        <DebtForm
          debt={selectedDebt}
          userAssets={userAssets}
          allDebts={debts}
          onClose={() => setModalStep('detail')}
          onSaved={() => {
            setModalStep('detail')
            loadDebts().then(() => {
              const supabase = createClient()
              supabase
                .from('debts')
                .select('*')
                .eq('id', selectedDebt.id)
                .single()
                .then(({ data }) => {
                  if (data) setSelectedDebt(data as Debt)
                })
            })
          }}
        />
      )}

      {selectedDebt && modalStep === 'revalue' && (
        <ValuationModal
          entityId={selectedDebt.id}
          entityType="debt"
          entityName={selectedDebt.name}
          entitySubtype={selectedDebt.debt_type}
          netWorthInclusionPct={selectedDebt.net_worth_inclusion_pct ?? 100}
          currentValue={Number(selectedDebt.current_balance)}
          onClose={() => setModalStep('detail')}
          onSaved={() => {
            setModalStep('detail')
            loadDebts().then(() => {
              const supabase = createClient()
              supabase
                .from('debts')
                .select('*')
                .eq('id', selectedDebt.id)
                .single()
                .then(({ data }) => {
                  if (data) setSelectedDebt(data as Debt)
                })
            })
            loadValuations(selectedDebt.id)
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
