'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus } from 'lucide-react'
import {
  type Debt,
  type DebtType,
  DEBT_TYPE_COLORS,
  DEBT_TYPE_LABELS,
} from '@/lib/debt-data'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { MaskedAmount } from '@/components/app/masked-amount'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { AddCategoryCard } from './add-category-card'
import { VermogenDebtCard } from './vermogen-debt-card'
import { buildKpiContext, type KpiContextRefs } from '@/lib/kpi-context'
import { computeDebtKpi } from '@/lib/debt-kpi'
import type { KpiPair } from '@/lib/asset-kpi'
import type { AssetConnectionSummary } from '@/lib/connections-data'
import { useFeatureAccess } from '@/components/app/feature-access-provider'
import { CategoryTabs, type CategoryTab } from './category-tabs'
import { CategoryHistoryChart } from './category-history-chart'
import type { CategoryHistoryData } from '@/lib/load-category-history'
import { createClient } from '@/lib/supabase/client'
import { usePerspective, usePerspectiveAbort } from '@/components/app/perspective-provider'
import { PerspectiveContextLabel } from '@/components/app/perspective-context-label'
import {
  loadPerspectiveData,
  type PerspectiveContext,
} from '@/lib/household/perspective-loader'
import { formatOwnershipSubline, type Perspective } from '@/lib/household-data'

// Lazy-load: deze overlays openen pas op user-actie. Houdt hun JS-chunk uit
// het initial-bundle → snellere mobile-LCP op de hero.
const QuickAddWizard = dynamic(
  () => import('@/components/app/quick-add-wizard/quick-add-wizard').then((m) => ({ default: m.QuickAddWizard })),
  { ssr: false },
)
const DebtPane = dynamic(
  () => import('@/components/app/core/debts/debt-pane').then((m) => ({ default: m.DebtPane })),
  { ssr: false },
)
const DebtValuationModal = dynamic(
  () => import('@/components/app/core/debts/debt-valuation-modal').then((m) => ({ default: m.ValuationModal })),
  { ssr: false },
)
import type { Valuation } from '@/components/app/core/debts/debt-types'
import type { Asset } from '@/lib/asset-data'
import {
  findDeepenings,
  getDeepeningComponent,
  getDeepeningSlug,
  type DeepeningEntry,
} from './category-deepening-registry'

// ── Constants ────────────────────────────────────────────────

const ITEMS_TAB_KEY = 'items'

// ── Helpers ──────────────────────────────────────────────────

/**
 * Item-label per debt-type — vermijdt awkward formules en geeft elke
 * categorie een natuurlijk Nederlandse term in counts en CTA's.
 */
function debtNoun(type: DebtType, count: number): [string, string] {
  const map: Record<DebtType, [string, string]> = {
    mortgage: ['hypotheek', 'hypotheken'],
    personal_loan: ['lening', 'leningen'],
    student_loan: ['studielening', 'studieleningen'],
    car_loan: ['autolening', 'autoleningen'],
    credit_card: ['creditcard', 'creditcards'],
    revolving_credit: ['krediet', 'kredieten'],
    payment_plan: ['regeling', 'regelingen'],
    belastingschuld: ['belastingschuld', 'belastingschulden'],
    familielening: ['familielening', 'familieleningen'],
    dga_schuld: ['DGA-schuld', 'DGA-schulden'],
    other: ['schuld', 'schulden'],
  }
  const [singular, plural] = map[type]
  return count === 1 ? [singular, singular] : [plural, plural]
}

function addDebtCta(type: DebtType): string {
  const [singular] = debtNoun(type, 1)
  return `Voeg ${singular} toe`
}

// ── Props ────────────────────────────────────────────────────

interface DebtCategoryPageProps {
  /** Validated DebtType — server-component heeft `notFound()` gedraaid bij invalid type. */
  type: DebtType
  /** Initiële schulden, server-side geladen. */
  initialDebts: Debt[]
  /**
   * Lichtgewicht refs (assets+debts+holdings) voor de KPI-strip onder elke
   * debt-card. Gebruikt voor o.a. mortgage LTV via `linked_asset_id`.
   * `undefined` (load-failure of geen relevante context) laat de strip
   * vervallen op individuele kaarten — pagina blijft functioneel.
   */
  initialKpiRefs?: KpiContextRefs
  /**
   * Mapping van debt-ID → actieve externe koppeling. Voorlopig leeg
   * (R-iteratie zonder actieve debt-API's), maar het display-pad is
   * voorbereid voor toekomstige hypotheek/bank-koppelingen.
   */
  initialConnectionsByDebtId?: Record<string, AssetConnectionSummary>
  /**
   * Per-debt 6-maands sparkline-waarden voor de breuklijn op elke
   * `<VermogenDebtCard>`. Server bouwt deze via `loadEntitySparklines()`.
   * Debts zonder historie ontbreken — overlay valt dan terug op rechte
   * scheidingslijn op het midden.
   */
  initialDebtSparklines?: Record<string, number[]>
  /**
   * Cumulatieve 12-maands historie voor de `<CategoryHistoryChart>` boven
   * de tabs. Optioneel: bij load-failure of <2 maanden data toont de chart
   * zijn eigen empty-state — pagina blijft functioneel.
   */
  initialHistoryData?: CategoryHistoryData
  /**
   * Perspectief van de server-eerste-paint (uit `getServerPerspective()`).
   * De client her-laadt via de browser-client zodra de gebruiker tijdens de
   * sessie van perspectief wisselt. Default 'personal' (solo).
   */
  initialPerspective?: Perspective
  /**
   * Huishoud-context van de eerste paint (partnernaam, aandeel-%, …). Wordt
   * vervangen wanneer de client her-laadt op een perspectief-switch.
   */
  initialContext?: PerspectiveContext
}

/** Schuldrij met perspectief-stempels (rij + provenance + aandeel). */
type PerspectiveDebt = Debt & {
  _provenance: 'eigen' | 'partner' | 'gezamenlijk'
  _myShareFraction: number
  _aggregated?: boolean
}

// ── Component ────────────────────────────────────────────────

/**
 * Categorie-pagina voor één schuld-type. Symmetrisch met
 * `asset-category-page.tsx` qua structuur — mini-hero, tabs en items-tab
 * met `<VermogenDebtCard />`.
 *
 * Geen verdiepings-tabs in deze ronde (de registry bevat geen debt-entries),
 * maar de hooks zijn gepositioneerd zodat een toekomstige `mortgage` →
 * "Aflossingsstrategie"-tab automatisch verschijnt zodra die in de registry
 * komt — geen wijziging aan deze pagina nodig.
 *
 * Design (UX-skill):
 * - Mini-hero: kicker (UPPERCASE 11px) + groot bedrag (DM Mono tabular-nums)
 *   + meta-regel (count + items). Onderaan een mini-bar in de type-specifieke
 *   debt-kleur — niet in tekst, alleen in de bar (krant-discipline).
 * - Items-tab: 1-koloms op mobiel, 2-koloms op tablet, 3-koloms op desktop.
 * - Empty state: krant-kicker + serif-italic uitleg + primaire CTA.
 */
export function DebtCategoryPage({
  type,
  initialDebts,
  initialKpiRefs,
  initialConnectionsByDebtId,
  initialDebtSparklines,
  initialHistoryData,
  initialPerspective = 'personal',
  initialContext,
}: DebtCategoryPageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { activeModules } = useFeatureAccess()

  // ── Perspectief-bewuste schuldenlijst ──────────────────────
  // Eerste paint komt van de server (initialDebts, in het server-perspectief).
  // Bij een in-sessie perspectief-switch her-laden we via de browser-client
  // zodat badges, aandeel-sublines en het hero-totaal meebewegen. Solo-gebruik
  // raakt dit pad nooit (perspective blijft 'personal' === initialPerspective).
  const { perspective } = usePerspective()
  const perspectiveSignal = usePerspectiveAbort(perspective)
  const [debts, setDebts] = useState<PerspectiveDebt[]>(
    initialDebts as unknown as PerspectiveDebt[],
  )
  const [ctx, setCtx] = useState<PerspectiveContext | null>(initialContext ?? null)

  useEffect(() => {
    // Eerste render in het server-perspectief gebruikt de props ongewijzigd —
    // geen dubbele fetch, geen flits.
    if (perspective === initialPerspective) {
      setDebts(initialDebts as unknown as PerspectiveDebt[])
      setCtx(initialContext ?? null)
      return
    }
    const signal = perspectiveSignal
    const supabase = createClient()
    loadPerspectiveData(supabase, perspective)
      .then(({ debts: loaded, context }) => {
        if (signal.aborted) return
        const filtered = (loaded as unknown as PerspectiveDebt[])
          .filter(
            (d) =>
              !d._aggregated &&
              d.debt_type === type &&
              d.is_active &&
              Number(d.current_balance) > 0,
          )
          .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
        setCtx(context)
        setDebts(filtered)
      })
      .catch(() => {
        // Non-fataal: behoud de huidige lijst bij een laadfout.
      })
  }, [perspective, initialPerspective, initialDebts, initialContext, type, perspectiveSignal])

  const [quickAddOpen, setQuickAddOpen] = useState(false)
  // URL-driven pane-state: `?debt=<id>` opent de slide-in pane voor die
  // schuld. Consistent met asset-category-page.tsx; `debt` is al de
  // canonieke OVERLAY_QUERY_KEY uit `lib/navigation.ts`.
  const requestedDebtId = searchParams.get('debt')
  const selectedDebt = useMemo(
    () => debts.find((d) => d.id === requestedDebtId) ?? null,
    [debts, requestedDebtId],
  )

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
      router.replace(
        `/core/debts/${type}${queryString ? `?${queryString}` : ''}`,
        { scroll: false },
      )
    },
    [router, searchParams, type],
  )

  // Side-data voor de pane: valuations (lazy per geselecteerde debt) en
  // de assets-lijst (eenmalig — debt-form heeft die nodig voor linked-asset
  // selecties bij mortgage/dga_schuld).
  const [valuationsByDebtId, setValuationsByDebtId] = useState<Record<string, Valuation[]>>({})
  const [userAssets, setUserAssets] = useState<Asset[]>([])

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    supabase
      .from('assets')
      .select('id, name, asset_type, current_value, linked_asset_id, is_active')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        if (cancelled) return
        if (data) setUserAssets(data as Asset[])
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!requestedDebtId) return
    if (valuationsByDebtId[requestedDebtId]) return
    const supabase = createClient()
    let cancelled = false
    supabase
      .from('valuations')
      .select('*')
      .eq('entity_id', requestedDebtId)
      .eq('entity_type', 'debt')
      .order('valuation_date', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (cancelled || !data) return
        setValuationsByDebtId((prev) => ({ ...prev, [requestedDebtId]: data as Valuation[] }))
      })
    return () => { cancelled = true }
  }, [requestedDebtId, valuationsByDebtId])

  // Multi-app: een schuld-categorie kan meerdere apps tonen (bv. mortgage
  // → Aflosstrategie + Hypotheekplanner). Symmetrisch met
  // `asset-category-page.tsx`: één tab per registry-entry, slug als
  // URL-state. We cachen `deepenings` achter useMemo zodat de array-
  // identiteit stabiel blijft zolang `type` niet wijzigt.
  const deepenings = useMemo(() => findDeepenings(type, 'debt'), [type])

  const tabs = useMemo<CategoryTab[]>(() => {
    const base: CategoryTab[] = [
      { key: ITEMS_TAB_KEY, label: itemsTabLabel(type) },
    ]
    for (const entry of deepenings) {
      const slug = getDeepeningSlug(entry)
      // Tab pas tonen wanneer er ook werkelijk een component voor de slug
      // bestaat — registry-entries zonder geregistreerd component (bv.
      // tijdens fasering) worden stilzwijgend overgeslagen.
      if (getDeepeningComponent(type, 'debt', slug) !== undefined) {
        base.push({ key: slug, label: entry.label })
      }
    }
    return base
  }, [type, deepenings])

  const requestedTab = searchParams.get('tab')
  const activeTabKey = useMemo(() => {
    if (requestedTab && tabs.some((t) => t.key === requestedTab)) {
      return requestedTab
    }
    return ITEMS_TAB_KEY
  }, [requestedTab, tabs])

  const handleTabChange = useCallback(
    (key: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (key === ITEMS_TAB_KEY) {
        params.delete('tab')
      } else {
        params.set('tab', key)
      }
      const queryString = params.toString()
      router.replace(
        `/core/debts/${type}${queryString ? `?${queryString}` : ''}`,
        { scroll: false },
      )
    },
    [router, searchParams, type],
  )

  useEffect(() => {
    if (
      requestedTab &&
      !tabs.some((tab) => tab.key === requestedTab)
    ) {
      handleTabChange(ITEMS_TAB_KEY)
    }
  }, [handleTabChange, requestedTab, tabs])

  // Hero-totaal is perspectief-correct: gedeelde schulden tellen in
  // eigen/partner-view alleen met hun aandeel mee (`_myShareFraction`), in
  // huishouden-view (en voor persoonlijke items) telt de volle waarde.
  const total = useMemo(
    () =>
      debts.reduce((sum, debt) => {
        const raw = Number(debt.current_balance)
        const v =
          debt.ownership === 'shared' && perspective !== 'household'
            ? raw * (debt._myShareFraction ?? 1)
            : raw
        return sum + v
      }, 0),
    [debts, perspective],
  )
  const count = debts.length
  const isItemsTab = activeTabKey === ITEMS_TAB_KEY

  // ── KPI's per debt voor de strip onder elke kaart ─────────
  // Bouw context één keer (incl. linked-asset Map voor LTV) en dispatch
  // per debt naar `computeDebtKpi`. Bij ontbrekende refs (load-failure)
  // valt LTV stilzwijgend weg — overige KPI's (rente, looptijd, benutting)
  // werken op lokale velden en blijven beschikbaar.
  const kpiByDebtId = useMemo(() => {
    const kpiCtx = initialKpiRefs
      ? buildKpiContext({
          assets: initialKpiRefs.assets as unknown as Parameters<typeof buildKpiContext>[0]['assets'],
          debts: initialKpiRefs.debts as unknown as Parameters<typeof buildKpiContext>[0]['debts'],
          holdings: initialKpiRefs.holdings,
        }).debt
      : {}
    const map = new Map<string, KpiPair>()
    for (const debt of debts) {
      const pair = computeDebtKpi(debt, kpiCtx)
      if (pair.primary || pair.secondary) {
        map.set(debt.id, pair)
      }
    }
    return map
  }, [debts, initialKpiRefs])

  // ── Actieve deepening ─────────────────────────────────────
  // Wanneer een verdiepings-tab actief is, zoeken we de bijbehorende entry
  // en component op basis van de slug. moduleActive wordt per entry
  // berekend — elke app respecteert zijn eigen module-flag.
  //
  // De component-lookup teruggegeven referentie is stabiel per slug; de
  // `react-hooks/static-components` regel slaat hier niet op werkelijke
  // runtime-stabiliteit. Hetzelfde patroon zit ook elders in de codebase
  // (zie `category-card.tsx`'s dynamic icon-resolutie).
  const activeDeepening: DeepeningEntry | undefined = deepenings.find(
    (entry) => !isItemsTab && getDeepeningSlug(entry) === activeTabKey,
  )
  const ActiveDeepeningComponent = getDeepeningComponent(
    type,
    'debt',
    activeTabKey,
  )
  const activeDeepeningModuleActive = activeDeepening
    ? activeModules.includes(activeDeepening.moduleId)
    : false

  const openDebtDetail = useCallback((debtId: string) => {
    setSelectedDebtId(debtId)
  }, [setSelectedDebtId])

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

  return (
    <div className="mx-auto max-w-6xl">
      <DebtCategoryHero type={type} total={total} count={count} />

      <div className="px-4 sm:px-6">
        <CategoryTabs
          tabs={tabs}
          activeKey={activeTabKey}
          onChange={handleTabChange}
          className="mt-4"
        />

        <div
          role="tabpanel"
          id={`category-tabpanel-${activeTabKey}`}
          aria-labelledby={`category-tab-${activeTabKey}`}
          className="py-6"
        >
          {isItemsTab ? (
            <>
              <DebtItemsTab
                type={type}
                debts={debts}
                kpiByDebtId={kpiByDebtId}
                connectionsByDebtId={initialConnectionsByDebtId}
                sparklinesByDebtId={initialDebtSparklines}
                onItemClick={openDebtDetail}
                onEditClick={handleDebtEdit}
                onRevalueClick={handleDebtRevalue}
                onAddClick={() => setQuickAddOpen(true)}
                perspective={perspective}
                partnerName={ctx?.partnerName ?? null}
              />

              {initialHistoryData && (
                <HideInSimple>
                  <section className="mt-8">
                    <CategoryHistoryChart
                      variant="debt"
                      subtype={type}
                      initialData={initialHistoryData}
                    />
                  </section>
                </HideInSimple>
              )}
            </>
          ) : ActiveDeepeningComponent ? (
            // Symmetrisch met `asset-category-page.tsx`: elke verdiepings-
            // tab krijgt zijn eigen `moduleActive` op basis van de
            // bijbehorende registry-entry. De tab-component is zelf
            // verantwoordelijk voor de tip-strip wanneer de module uit staat.
            <ActiveDeepeningComponent
              type={type}
              moduleActive={activeDeepeningModuleActive}
            />
          ) : null}
        </div>
      </div>

      {quickAddOpen && (
        <QuickAddWizard
          open
          onClose={() => setQuickAddOpen(false)}
          initialIntent="debt"
          initialDebtType={type}
          onSaved={() => {
            setQuickAddOpen(false)
            router.refresh()
          }}
        />
      )}

      {selectedDebt && (
        <DebtPane
          debt={selectedDebt}
          valuations={valuationsByDebtId[selectedDebt.id]}
          userAssets={userAssets}
          allDebts={debts}
          onClose={() => setSelectedDebtId(null)}
          onChanged={() => router.refresh()}
        />
      )}

      {/* Direct saldo-bijwerken — geopend door de "Saldo bijwerken"-knop op
          een kaart. Sibling sheet (driewegregel kind="sheet") die de detail-
          pane bewust overslaat zodat één klik direct in de invoer-modal landt. */}
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
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

// ── Items-tab label ──────────────────────────────────────────

function itemsTabLabel(type: DebtType): string {
  const labels: Partial<Record<DebtType, string>> = {
    mortgage: 'Hypotheken',
    personal_loan: 'Leningen',
    student_loan: 'Studieleningen',
    car_loan: 'Autoleningen',
    credit_card: 'Creditcards',
    revolving_credit: 'Kredieten',
    payment_plan: 'Regelingen',
    belastingschuld: 'Aanslagen',
    familielening: 'Leningen',
    dga_schuld: 'Schulden',
    other: 'Items',
  }
  return labels[type] ?? 'Items'
}

// ── Mini-hero ────────────────────────────────────────────────

interface DebtCategoryHeroProps {
  type: DebtType
  total: number
  count: number
}

function DebtCategoryHero({ type, total, count }: DebtCategoryHeroProps) {
  const accentColor = DEBT_TYPE_COLORS[type]
  const { ref, hasEntered } = useInViewAnimation({ duration: 600 })
  const [, plural] = debtNoun(type, count === 1 ? 1 : 2)
  const counterLabel = count === 1 ? debtNoun(type, 1)[0] : plural

  return (
    <section className="border-b border-[var(--border-ed)] bg-[var(--paper)]">
      {/* Module-active accent (Kern-500 op /core/debts/**) */}
      <div className="h-1" style={{ background: 'var(--module-active-500)' }} />

      <div className="px-4 py-5 sm:px-6 sm:py-7">
        {/* Hairline-kicker — canonieke PageOpening-spec in module-active-accent.
            Rood (--negative) blijft uitsluitend voor negatieve semantiek
            (bedragen/status), niet als kop-identiteit. */}
        <div className="flex flex-wrap items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--module-active-700)]">
          <span
            aria-hidden
            className="inline-block h-px w-7 shrink-0"
            style={{ background: 'var(--module-active-500)' }}
          />
          {DEBT_TYPE_LABELS[type]}
          <PerspectiveContextLabel className="normal-case tracking-normal" />
        </div>

        {/* Hoofdbedrag (restschuld) met halve transparante streep */}
        <p
          className="mt-2 leading-none tracking-tight text-[var(--ink)]"
          style={{
            fontFamily: 'var(--font-playfair, var(--font-mono, monospace))',
          }}
        >
          <span
            className="inline px-1"
            style={{
              backgroundImage:
                'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
            }}
          >
            <MaskedAmount
              value={total}
              tone="kern"
              monoWhenVisible={false}
              className="text-[28px] font-bold leading-none tracking-tight sm:text-[36px]"
            />
          </span>
        </p>

        {/* Sub-meta in italic Source Serif + type-bar */}
        <div
          ref={ref as unknown as React.RefObject<HTMLDivElement>}
          className="mt-3 flex items-center gap-3"
        >
          <div
            className="h-1 w-16 overflow-hidden bg-[var(--subtle)]"
            aria-hidden="true"
          >
            <span
              className="block h-full"
              style={{
                width: hasEntered ? '100%' : '0%',
                backgroundColor: accentColor,
                transition: 'width 600ms cubic-bezier(.22,1,.36,1)',
              }}
            />
          </div>
          <p
            className="italic text-[12px] text-[var(--ink-3)]"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            {count} {counterLabel}
          </p>
        </div>
      </div>
    </section>
  )
}

// ── Items-tab ────────────────────────────────────────────────

interface DebtItemsTabProps {
  type: DebtType
  debts: PerspectiveDebt[]
  kpiByDebtId?: Map<string, KpiPair>
  connectionsByDebtId?: Record<string, AssetConnectionSummary>
  sparklinesByDebtId?: Record<string, number[]>
  onItemClick: (debtId: string) => void
  onEditClick: (debtId: string) => void
  onRevalueClick: (debtId: string) => void
  onAddClick: () => void
  /** Actief perspectief — voor de herkomst-badge + aandeel-subline. */
  perspective: Perspective
  /** Partnernaam voor de partner-badge. */
  partnerName: string | null
}

function DebtItemsTab({
  type,
  debts,
  kpiByDebtId,
  connectionsByDebtId,
  sparklinesByDebtId,
  onItemClick,
  onEditClick,
  onRevalueClick,
  onAddClick,
  perspective,
  partnerName,
}: DebtItemsTabProps) {
  if (debts.length === 0) {
    return <EmptyDebtsState type={type} onAddClick={onAddClick} />
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {debts.map((debt, idx) => (
        <VermogenDebtCard
          key={debt.id}
          debt={debt}
          kpiPair={kpiByDebtId?.get(debt.id)}
          connection={connectionsByDebtId?.[debt.id]}
          sparklineValues={sparklinesByDebtId?.[debt.id]}
          onClick={onItemClick}
          onEditClick={onEditClick}
          onRevalueClick={onRevalueClick}
          staggerIndex={idx}
          provenance={debt._provenance}
          perspective={perspective}
          partnerName={partnerName}
          ownershipSubline={formatOwnershipSubline(
            debt,
            perspective,
            Number(debt.current_balance),
          )}
        />
      ))}
      <AddCategoryCard
        label={addDebtCta(type)}
        onClick={onAddClick}
        variant="debt"
        shape="item"
        staggerIndex={debts.length}
      />
    </div>
  )
}

// ── Empty state ──────────────────────────────────────────────

interface EmptyDebtsStateProps {
  type: DebtType
  onAddClick: () => void
}

function EmptyDebtsState({ type, onAddClick }: EmptyDebtsStateProps) {
  const [singular, plural] = debtNoun(type, 2)
  return (
    <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-6 py-10 text-center">
      <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
        Geen {plural} geregistreerd
      </p>
      <p className="mt-2 font-serif italic text-base leading-relaxed text-[var(--ink-2)]">
        Voeg een {debtNoun(type, 1)[0]} toe om hier overzicht te krijgen — wat je ziet, kun je oplossen.
      </p>
      <button
        type="button"
        onClick={onAddClick}
        className="mt-4 inline-flex h-11 items-center gap-2 border border-kern-300 bg-kern-50 px-4 text-sm font-medium text-kern-700 transition-colors hover:bg-kern-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {addDebtCta(type)}
      </button>
      {/* `singular` is opzettelijk niet gebruikt in de zichtbare copy — bewaard
          voor toekomstige variant-tekst zonder de helper te splitsen. */}
      <span className="sr-only">{singular}</span>
    </div>
  )
}
