'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Plus } from 'lucide-react'
import {
  type Debt,
  type DebtType,
  DEBT_TYPE_COLORS,
  DEBT_TYPE_LABELS,
} from '@/lib/debt-data'
import { formatCurrency } from '@/lib/format'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { QuickAddWizard } from '@/components/app/quick-add-wizard/quick-add-wizard'
import { VermogenDebtCard } from './vermogen-debt-card'
import { buildKpiContext, type KpiContextRefs } from '@/lib/kpi-context'
import { computeDebtKpi } from '@/lib/debt-kpi'
import type { KpiPair } from '@/lib/asset-kpi'
import type { AssetConnectionSummary } from '@/lib/connections-data'
import { useFeatureAccess } from '@/components/app/feature-access-provider'
import { CategoryTabs, type CategoryTab } from './category-tabs'
import { DebtDetailSheet } from './debt-detail-sheet'
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
}: DebtCategoryPageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { activeModules } = useFeatureAccess()

  const debts = initialDebts
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null)
  const selectedDebt = useMemo(
    () => debts.find((d) => d.id === selectedDebtId) ?? null,
    [debts, selectedDebtId],
  )

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

  const total = useMemo(
    () => debts.reduce((sum, debt) => sum + Number(debt.current_balance), 0),
    [debts],
  )
  const count = debts.length
  const isItemsTab = activeTabKey === ITEMS_TAB_KEY

  // ── KPI's per debt voor de strip onder elke kaart ─────────
  // Bouw context één keer (incl. linked-asset Map voor LTV) en dispatch
  // per debt naar `computeDebtKpi`. Bij ontbrekende refs (load-failure)
  // valt LTV stilzwijgend weg — overige KPI's (rente, looptijd, benutting)
  // werken op lokale velden en blijven beschikbaar.
  const kpiByDebtId = useMemo(() => {
    const ctx = initialKpiRefs
      ? buildKpiContext({
          assets: initialKpiRefs.assets as unknown as Parameters<typeof buildKpiContext>[0]['assets'],
          debts: initialKpiRefs.debts as unknown as Parameters<typeof buildKpiContext>[0]['debts'],
          holdings: initialKpiRefs.holdings,
        }).debt
      : {}
    const map = new Map<string, KpiPair>()
    for (const debt of debts) {
      const pair = computeDebtKpi(debt, ctx)
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
  }, [])

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
            <DebtItemsTab
              type={type}
              debts={debts}
              kpiByDebtId={kpiByDebtId}
              connectionsByDebtId={initialConnectionsByDebtId}
              onItemClick={openDebtDetail}
              onAddClick={() => setQuickAddOpen(true)}
            />
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

      <QuickAddWizard
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        initialIntent="debt"
        onSaved={() => {
          setQuickAddOpen(false)
          router.refresh()
        }}
      />

      <DebtDetailSheet
        debt={selectedDebt}
        onClose={() => setSelectedDebtId(null)}
      />
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
      {/* Kern-bruin module-streep — schulden vallen onder de Kern-module. */}
      <div className="h-1 bg-kern-500" />

      <div className="px-4 py-5 sm:px-6 sm:py-7">
        <Link
          href="/core"
          className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
          <span>Kern</span>
        </Link>

        <p className="mt-3 text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          {DEBT_TYPE_LABELS[type]}
        </p>

        <p
          className="mt-1 font-mono text-[28px] font-bold tabular-nums leading-none tracking-tight text-[var(--ink)] sm:text-[36px]"
          style={{
            fontFamily: 'var(--font-playfair, var(--font-mono, monospace))',
          }}
        >
          {formatCurrency(total)}
        </p>

        <div ref={ref as unknown as React.RefObject<HTMLDivElement>} className="mt-3 flex items-center gap-3">
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
          <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
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
  debts: Debt[]
  kpiByDebtId?: Map<string, KpiPair>
  connectionsByDebtId?: Record<string, AssetConnectionSummary>
  onItemClick: (debtId: string) => void
  onAddClick: () => void
}

function DebtItemsTab({
  type,
  debts,
  kpiByDebtId,
  connectionsByDebtId,
  onItemClick,
  onAddClick,
}: DebtItemsTabProps) {
  if (debts.length === 0) {
    return <EmptyDebtsState type={type} onAddClick={onAddClick} />
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {debts.map((debt, idx) => (
          <VermogenDebtCard
            key={debt.id}
            debt={debt}
            kpiPair={kpiByDebtId?.get(debt.id)}
            connection={connectionsByDebtId?.[debt.id]}
            onClick={onItemClick}
            staggerIndex={idx}
          />
        ))}
      </div>

      <div className="pt-2">
        <button
          type="button"
          onClick={onAddClick}
          className="inline-flex h-11 items-center gap-2 border border-kern-200 bg-kern-50 px-4 text-sm font-medium text-kern-700 transition-colors hover:bg-kern-100 hover:text-kern-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {addDebtCta(type)}
        </button>
      </div>
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
