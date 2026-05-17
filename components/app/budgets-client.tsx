'use client'

/**
 * Fase 1.1 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §5.1 + §6.1 + §6.4
 * Budget-detail wordt pane (desktop) / stack-push (mobile) via <ShellOverlay kind="pane">.
 *
 * Pane-state heeft één bron-of-truth: `useSearchParams` op deze pagina.
 *  - Open detail: `?budget=<id>` (push via router.replace)
 *  - Edit-mode binnen pane: `?budget=<id>&edit=true` (compositie, plan §6.4)
 *  - Sluiten: query-params verwijderen → `/core/budgets`
 *
 * ShellOverlay zelf kijkt niet naar de feature-flag `new_navigation_shell`;
 * dat is verantwoordelijkheid van ResponsiveShell. Op deze pagina is de
 * pane dus altijd actief: een visuele upgrade die geen functionaliteit-
 * verlies veroorzaakt en de migratie geleidelijk maakt. Mobile (<lg)
 * krijgt voorlopig nog een full-height BottomSheet als pane-fallback;
 * Fase 0.5 vervangt dat door echte stack-push via NavStackProvider.
 *
 * Volgt nog (out of scope hier):
 *  - §6.1 Transactie-detail als pane-binnen-pane (met onBack).
 *  - §6.4 `/core/budgets/new` als sheet via `?new=true`.
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import {
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Plus, Pencil, Save, Trash2,
  GitFork, CircleDot, AlertTriangle, CheckCircle2, Heart, LayoutGrid,
  TrendingUp, AlertCircle, BarChart3, EyeOff, MessageCircle, FileText, MoveRight,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getDefaultBudgets, BUDGET_SLUGS, type Budget, type BudgetWithChildren } from '@/lib/budget-data'
import type { BudgetsPageData, BudgetGoal } from '@/lib/budgets-data-loader'
import { BudgetIcon, formatCurrency, getTypeColors, isOverPositive, computeBarSegments, iconMap, iconOptions, type BudgetType } from '@/components/app/budget-shared'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { buildSegments, typeColors, childTypeColors } from '@/components/app/budget-donut'
import { type BudgetRollover, formatPeriod, getCarriedAmount, getPreviousPeriod, computeRollover } from '@/lib/budget-rollover'
import { BudgetTree } from '@/components/app/budget-tree'
import { BudgetDonut } from '@/components/app/budget-donut'
import { BudgetHeatmap, type HeatmapSection } from '@/components/app/budget-heatmap'
import { useDailyExpenseRate, eurToFreedomTime } from '@/components/app/freedom-time-label'
import { BudgetSparkline, SparklineWithLabel, type SparklineDataPoint } from '@/components/app/budget-sparkline'
import { computeBudgetForecast, getConfidenceLabel, getConfidenceColors, type BudgetForecast } from '@/lib/budget-forecast'
import { OwnershipToggle, OwnershipBadge, useHouseholdStatus, type OwnershipType } from '@/components/app/ownership-toggle'
import { usePerspective, usePerspectiveAbort } from '@/components/app/perspective-provider'
import { usePartnerPrivacy, PrivacyHiddenNotice } from '@/components/app/privacy-hidden-notice'
import { SpendingConfidenceBadge, SpendingVarianceDetailPanel, calculateSpendingVariance, type SpendingVarianceData } from '@/components/app/spending-confidence-indicator'
import { useChatContext } from '@/components/app/chat/chat-provider'
import { GoalForm } from '@/components/app/goal-form'
import { BudgetPlanEditorSheet } from '@/components/app/budget-plan-editor-sheet'
import { AICategorizeSheet } from '@/components/app/ai-categorize-sheet'
import { TransactionForm } from '@/components/app/transaction-form'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { BudgetForm, type BudgetFormActionsState } from '@/components/app/budget-form'
import { useToast } from '@/components/app/toast-provider'
import { OVERLAY_QUERY_KEYS } from '@/lib/navigation'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { FeatureGate } from '@/components/app/feature-gate'
import { CollapsibleSection } from '@/components/app/collapsible-section'
import { NibudBenchmarkSection } from '@/components/app/will/nibud-benchmark'
import { computeSharePct, SPLIT_MODE_LABELS, type SplitMode } from '@/lib/household-data'
import { Users } from 'lucide-react'
import { MaskedAmount } from '@/components/app/masked-amount'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { PageInfoButton } from '@/components/editorial'
import { PAGE_INFO } from '@/lib/page-info-content'


type Goal = BudgetGoal

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── Editorial header voor de Budgetteren-app ─────────────────────
//
// Implementatie van Type "App · Budgetteren" uit de ui-ux skill blueprint.
// Bovenaan de pagina, boven de bestaande maand-selector. Pure presentatie —
// gebruikt alleen al bestaande state (monthLabel, teVerdelen, totalIncome).

function BudgetEditorialHeader({
  monthLabel,
  teVerdelen,
  totalIncome,
  totalIncomeActual,
  totalActualOutflow,
}: {
  monthLabel: string
  teVerdelen: number
  totalIncome: number
  totalIncomeActual: number
  /**
   * Som van werkelijke uitgaven + sparen + aflossingen deze periode.
   * Wordt gebruikt voor de "Werkelijk"-kolom: hoeveel van het verwachte
   * inkomen is feitelijk al uit het huishouden gestroomd.
   */
  totalActualOutflow: number
}) {
  const periodKicker = monthLabel
    ? monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)
    : ''

  // Twee perspectieven op "ruimte":
  //  - Volgens plan: verwacht inkomen − toegewezen budgetten (`teVerdelen`).
  //    Toont of het BUDGET dat je hebt opgesteld klopt met je inkomen.
  //  - Werkelijk: verwacht inkomen − werkelijke outflow tot nu toe.
  //    Toont hoeveel je deze maand nog vrij hebt op basis van wat al weg is.
  const { masked } = useMaskedAmounts()
  const planRuimte = teVerdelen
  const planPositive = planRuimte >= 0
  const planLabel = planPositive ? '€' : '−€'
  const planBedrag = formatMaskedCurrency(Math.abs(planRuimte), masked)

  const werkelijkRuimte = totalIncome - totalActualOutflow
  const werkelijkPositive = werkelijkRuimte >= 0
  const werkelijkLabel = werkelijkPositive ? '€' : '−€'
  const werkelijkBedrag = formatMaskedCurrency(Math.abs(werkelijkRuimte), masked)

  return (
    <header className="relative mb-6 space-y-3">
      <PageInfoButton
        description={PAGE_INFO['/core/budgets']}
        className="absolute right-0 top-0"
      />
      <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
        <span
          aria-hidden
          className="inline-block h-px w-7 shrink-0"
          style={{ background: 'var(--module-active-500)' }}
        />
        Budgetteren {periodKicker && `· ${periodKicker}`}
      </div>

      <h1
        className="font-bold leading-tight tracking-[-0.02em] text-[28px] sm:text-[36px] md:text-[44px]"
        style={{ fontFamily: 'var(--font-playfair, serif)' }}
      >
        Hoeveel{' '}
        <em
          className="font-normal italic"
          style={{ color: 'var(--module-active-700)' }}
        >
          ruimte
        </em>{' '}
        heb je nog?
      </h1>

      {/* Twee kolommen: plan vs. werkelijk. Plan gebruikt highlight-marker
          (Kern-200), werkelijk blijft sober — zo vormt het plan-cijfer het
          anker en is werkelijk de aanvullende lezing. */}
      <div className="mt-2 grid grid-cols-1 gap-4 border-t border-[var(--border-ed)] pt-3 sm:grid-cols-2 sm:divide-x sm:divide-[var(--border-ed)] sm:gap-0">
        <div className="sm:pr-6">
          <p className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)]">
            Volgens plan
          </p>
          <p className="mt-1 font-mono tabular-nums text-[28px] sm:text-[36px] font-bold leading-none">
            <span
              className="inline px-1"
              style={{
                backgroundImage:
                  'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
                color: planPositive ? 'var(--ink)' : 'var(--negative)',
              }}
            >
              {planLabel} {planBedrag}
            </span>
          </p>
          <p
            className="mt-2 italic text-[12px] text-[var(--ink-3)]"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            {planPositive
              ? `Te verdelen van ${formatMaskedCurrency(totalIncome, masked)} verwacht inkomen`
              : `Over-toegewezen — ${formatMaskedCurrency(Math.abs(planRuimte), masked)} meer dan verwacht inkomen`}
          </p>
        </div>

        <div className="sm:pl-6">
          <p className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)]">
            Werkelijk
          </p>
          <p
            className="mt-1 font-mono tabular-nums text-[28px] sm:text-[36px] font-bold leading-none"
            style={{ color: werkelijkPositive ? 'var(--ink)' : 'var(--negative)' }}
          >
            {werkelijkLabel} {werkelijkBedrag}
          </p>
          <p
            className="mt-2 italic text-[12px] text-[var(--ink-3)]"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            {werkelijkPositive
              ? `Nog te besteden — ${formatMaskedCurrency(totalActualOutflow, masked)} al weg deze maand`
              : `Boven inkomen — ${formatMaskedCurrency(Math.abs(werkelijkRuimte), masked)} meer uitgegeven dan verwacht`}
            {totalIncomeActual > 0 &&
              totalIncome > 0 &&
              ` · ontvangen: ${formatMaskedCurrency(totalIncomeActual, masked)}`}
          </p>
        </div>
      </div>
    </header>
  )
}

/**
 * Eén kolom in de 4-koloms KPI-strip onder de maand-selector.
 * Format: kicker (UPPERCASE, in eigen kleur) + bedrag in Playfair (x/y format)
 * + sub-meta in italic Source Serif. Sparen kan een halve transparante streep
 * (highlight-marker) krijgen. Klikbaar via `href` (deeplink naar #-anchor).
 */
function BudgetKpiCell({
  kicker,
  kickerColor,
  actual,
  target,
  actionLabel,
  tagline,
  taglineColor,
  highlight = false,
  href,
}: {
  kicker: string
  kickerColor: string
  actual: number
  target: number
  actionLabel: string
  tagline?: string
  taglineColor?: string
  highlight?: boolean
  href?: string
}) {
  const cellClass =
    'p-3 sm:p-4 border-r border-[var(--rule-soft)] last:border-r-0 [&:nth-child(-n+2)]:border-b sm:[&:nth-child(-n+2)]:border-b-0 last:border-b-0 text-center'

  const inner = (
    <>
      {/* Kicker UPPERCASE in eigen kleur — geen streep want compact */}
      <p
        className="text-[10px] uppercase tracking-[0.18em] font-mono font-semibold"
        style={{ color: kickerColor }}
      >
        {kicker}
      </p>
      {/* Hoofdbedrag (x/y) — actual links + " / " + budget rechts.
          Sparen krijgt halve transparante streep. */}
      <p
        className="mt-1 sm:mt-1.5 text-[15px] sm:text-[20px] font-bold leading-none tracking-[-0.01em] tabular-nums"
        style={{
          fontFamily: 'var(--font-playfair, serif)',
          color: 'var(--ink)',
        }}
      >
        {highlight ? (
          <span
            className="inline px-1"
            style={{
              backgroundImage:
                'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
            }}
          >
            {<MaskedAmount value={actual} tone="wil" />} / {<MaskedAmount value={target} tone="wil" />}
          </span>
        ) : (
          <>
            {<MaskedAmount value={actual} tone="wil" />} / {<MaskedAmount value={target} tone="wil" />}
          </>
        )}
      </p>
      {/* Sub-meta italic — actie-label */}
      <p
        className="mt-1 italic text-[10px] sm:text-[11px] text-[var(--ink-3)]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        {actionLabel}
      </p>
      {/* Optionele tagline (vrijheid opbouwen / terugkopen) */}
      {tagline && (
        <p
          className="hidden sm:block mt-0.5 italic text-[10px]"
          style={{
            fontFamily: 'var(--font-source-serif, Georgia, serif)',
            color: taglineColor ?? 'var(--ink-3)',
          }}
        >
          {tagline}
        </p>
      )}
    </>
  )

  if (href) {
    return (
      <a
        href={href}
        className={`${cellClass} block transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]`}
      >
        {inner}
      </a>
    )
  }
  return <div className={cellClass}>{inner}</div>
}

type HubAlert = { id: string; name: string; spent: number; limit: number; pct: number; severity: 'over' | 'bijna' }

function BudgetHub({
  hubAlertsVisible,
  hubAlertsExtra,
  dekkingsgraad,
  opSchemaCount,
  parentBudgetsCount,
  formatCurrency: fmt,
  openWithMessage,
  totalIncome,
  teVerdelen,
  periodMode,
  onOpenPlanEditor,
  onOpenBudget,
  uncategorizedCount,
  uncategorizedTotal,
  onUncategorizedClick,
  coverageRatio,
  totalIncomeActual,
  budgetingActive,
}: {
  hubAlertsVisible: HubAlert[]
  hubAlertsExtra: number
  dekkingsgraad: number
  opSchemaCount: number
  parentBudgetsCount: number
  formatCurrency: (n: number) => string
  openWithMessage: (message: string) => void
  totalIncome: number
  teVerdelen: number
  periodMode: 'maand' | 'ytd' | '12m'
  onOpenPlanEditor: () => void
  onOpenBudget: (id: string) => void
  uncategorizedCount: number
  uncategorizedTotal: number
  onUncategorizedClick: () => void
  coverageRatio: number
  totalIncomeActual: number
  budgetingActive: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const { dailyExpenseRate, loading: rateLoading, source } = useDailyExpenseRate()
  const hasFreedomData = !rateLoading && source === 'transactions' && dailyExpenseRate > 0

  const overCount = hubAlertsVisible.filter(a => a.severity === 'over').length
  const bijnaCount = hubAlertsVisible.filter(a => a.severity === 'bijna').length + hubAlertsExtra

  // KPI visibility — KPI-grid bevat Te Verdelen, Dekking, Schema
  const showTeVerdelen = periodMode === 'maand' && totalIncome > 0
  const showDekking = totalIncome > 0
  const showSchema = parentBudgetsCount > 0
  const kpiCount = (showTeVerdelen ? 1 : 0) + (showDekking ? 1 : 0) + (showSchema ? 1 : 0)
  const hasKPI = kpiCount > 0

  // Attention-list: items in prioriteits-volgorde
  const showOverAllocated = dekkingsgraad > 100 && periodMode === 'maand'
  // "Nog te verdelen" — triggeren we alleen bij > 1 euro om rondingsruis te negeren
  const showTeVerdelenAttention = periodMode === 'maand' && teVerdelen > 1
  const showCoverage = coverageRatio < 0.99 && totalIncome > 0
  const showUncategorized = budgetingActive && uncategorizedCount > 0
  const hasAnyAttention =
    showOverAllocated ||
    showTeVerdelenAttention ||
    showCoverage ||
    hubAlertsVisible.length > 0 ||
    showUncategorized
  // "Alles op schema" alleen als niks anders aandacht vraagt
  const showAllOnSchedule =
    !hasAnyAttention && parentBudgetsCount > 0 && opSchemaCount === parentBudgetsCount
  const hasAttention = hasAnyAttention || showAllOnSchedule

  const hasAnyContent = hasKPI || hasAttention

  if (!hasAnyContent) return null

  // Collapsed-header preview snippets — max 3 to keep the one-liner scannable
  const previewSnippets: React.ReactNode[] = []
  if (overCount > 0) {
    previewSnippets.push(<span key="over" className="text-red-600">{overCount} overschreden</span>)
  }
  if (bijnaCount > 0) {
    previewSnippets.push(<span key="bijna" className="text-amber-600">{bijnaCount} bijna vol</span>)
  }
  if (dekkingsgraad > 100 || teVerdelen < 0) {
    previewSnippets.push(
      <span key="over-alloc" className="text-negative">{fmt(Math.abs(teVerdelen))} over-toegewezen</span>
    )
  }
  if (periodMode === 'maand' && teVerdelen > 1) {
    previewSnippets.push(
      <span key="te-verdelen" className="text-amber-600">{fmt(teVerdelen)} te verdelen</span>
    )
  }
  if (uncategorizedCount > 0) {
    previewSnippets.push(
      <span key="uncat" className="text-kern-600">{uncategorizedCount} ongecategoriseerd</span>
    )
  }
  const visibleSnippets = previewSnippets.slice(0, 3)

  // Grid-cols klasse afgeleid uit kpiCount (Tailwind heeft deze klassen statisch nodig)
  const gridColsClass =
    kpiCount === 3 ? 'grid-cols-3' : kpiCount === 2 ? 'grid-cols-2' : 'grid-cols-1'

  // Dekking-kleur: default inkt, negatief bij over-toegewezen of lage coverage
  const dekkingColorClass =
    dekkingsgraad > 100 || coverageRatio < 0.8 ? 'text-negative' : 'text-[var(--ink)]'
  // Schema-kleur: groen als alles op schema, anders default
  const schemaColorClass =
    opSchemaCount === parentBudgetsCount ? 'text-positive' : 'text-[var(--ink)]'

  return (
    <div className="mt-4 overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)]">
      {/* Kleur-accent bovenaan — editorial pattern */}
      <div className="h-1 bg-wil-500" />
      {/* Header — clickable to toggle */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-wil-50 px-2 py-0.5 font-sans text-[9px] font-semibold uppercase tracking-[0.08em] text-wil-700">Will</span>
          <span className="font-sans text-xs font-semibold text-[var(--ink-2)]">Budgetanalyse</span>
          {!expanded && visibleSnippets.length > 0 && (
            <span className="font-sans text-[11px] text-[var(--ink-3)]">
              {'— '}
              {visibleSnippets.map((snippet, i) => (
                <span key={i}>
                  {snippet}
                  {i < visibleSnippets.length - 1 && ', '}
                </span>
              ))}
            </span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-[var(--ink-3)] transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
      <div className="border-t border-[var(--border-ed)] px-4 py-3">
        {/* Blok 1: KPI-grid — scanbare top-rij met kritieke metrics */}
        {hasKPI && (
          <div className={`grid gap-3 ${gridColsClass}`}>
            {showTeVerdelen && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">Te verdelen</p>
                <p className={`mt-1 font-mono tabular-nums text-lg font-semibold ${teVerdelen >= 0 ? 'text-positive' : 'text-negative'}`}>
                  {teVerdelen >= 0 ? '' : '–'}{fmt(Math.abs(teVerdelen))}
                </p>
                <p className="mt-0.5 font-serif text-[11px] italic text-[var(--ink-3)]">
                  van {fmt(totalIncome)} inkomen
                </p>
              </div>
            )}
            {showDekking && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">Dekking</p>
                <p className={`mt-1 font-mono tabular-nums text-lg font-semibold ${dekkingColorClass}`}>
                  {dekkingsgraad.toFixed(0)}%
                </p>
                <p className="mt-0.5 font-serif text-[11px] italic text-[var(--ink-3)]">
                  van inkomen toegewezen
                </p>
              </div>
            )}
            {showSchema && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">Schema</p>
                <p className={`mt-1 font-mono tabular-nums text-lg font-semibold ${schemaColorClass}`}>
                  {opSchemaCount} / {parentBudgetsCount}
                </p>
                <p className="mt-0.5 font-serif text-[11px] italic text-[var(--ink-3)]">
                  van alle hoofdbudgetten op schema
                </p>
              </div>
            )}
          </div>
        )}

        {/* Blok 2: Aandachtslijst — unified, prioriteit-gesorteerd */}
        {hasAttention && (() => {
          // Gemeenschappelijke container-classes voor alle aandacht-items.
          // Elk item krijgt dezelfde verticale ruimte (py-2) en indent (px-2
          // -mx-2), waardoor bolletjes, tekst en rechter-pijl overal op dezelfde
          // positie staan — of het item nu klikbaar is of niet. Klikbare items
          // voegen hover + min-h-[44px] touch-target toe.
          const rowBase = 'flex items-start gap-2 py-2 px-2 -mx-2'
          const rowInteractive = `group w-full text-left min-h-[44px] hover:bg-[var(--subtle)] ${rowBase}`
          const dotBase = 'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full'
          const textBase = 'font-serif text-[13px] italic leading-snug text-[var(--ink-2)]'
          const arrowClasses = 'mt-1 h-3.5 w-3.5 shrink-0 text-[var(--ink-4)] transition-transform group-hover:translate-x-0.5'

          return (
            <div className={hasKPI ? 'mt-3 border-t border-[var(--border-ed)] pt-3' : ''}>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">Aandacht</p>
              <div className="mt-1">
                {/* 1. Over-toegewezen — klikbaar, opent budget plan editor */}
                {showOverAllocated && (
                  <button
                    type="button"
                    onClick={onOpenPlanEditor}
                    className={rowInteractive}
                    aria-label={`Over-toegewezen met ${fmt(Math.abs(teVerdelen))} — open budget bewerken`}
                  >
                    <span className={`${dotBase} bg-negative`} />
                    <div className="min-w-0 flex-1">
                      <p className={textBase}>
                        <strong className="not-italic font-semibold">Over-toegewezen</strong> — je hebt {fmt(Math.abs(teVerdelen))} meer toegewezen dan verwacht inkomen
                      </p>
                    </div>
                    <MoveRight className={arrowClasses} />
                  </button>
                )}

                {/* 2. Nog te verdelen — klikbaar, opent budget plan editor */}
                {showTeVerdelenAttention && (
                  <button
                    type="button"
                    onClick={onOpenPlanEditor}
                    className={rowInteractive}
                    aria-label={`${fmt(teVerdelen)} nog te verdelen — open budget bewerken`}
                  >
                    <span className={`${dotBase} bg-amber-400`} />
                    <div className="min-w-0 flex-1">
                      <p className={textBase}>
                        <strong className="not-italic font-semibold">Nog te verdelen</strong> — {fmt(teVerdelen)} van je inkomen is niet toegewezen
                      </p>
                    </div>
                    <MoveRight className={arrowClasses} />
                  </button>
                )}

                {/* 3. Coverage-issue — informatief, niet klikbaar */}
                {showCoverage && (
                  <div className={rowBase}>
                    <span className={`${dotBase} ${coverageRatio >= 0.8 ? 'bg-amber-400' : 'bg-red-500'}`} />
                    <div className="min-w-0 flex-1">
                      <p className={textBase}>
                        <strong className="not-italic font-semibold">{Math.round(coverageRatio * 100)}% gedekt</strong> — {fmt(totalIncomeActual)} van {fmt(totalIncome)} ontvangen
                      </p>
                    </div>
                  </div>
                )}

                {/* 4. Overschreden budgetten + 5. bijna-vol — klikbaar, opent detail-modal */}
                {hubAlertsVisible.map(alert => {
                  const overAmount = alert.severity === 'over' ? alert.spent - alert.limit : 0
                  const freedomTime = hasFreedomData && overAmount >= 100
                    ? eurToFreedomTime(overAmount, dailyExpenseRate)
                    : null
                  const dotColor = alert.severity === 'over' ? 'bg-red-500' : 'bg-amber-400'
                  const severityLabel = alert.severity === 'over' ? 'overschreden' : 'bijna vol'

                  return (
                    <button
                      key={alert.id}
                      type="button"
                      onClick={() => onOpenBudget(alert.id)}
                      className={rowInteractive}
                      aria-label={`Open ${alert.name} — ${alert.pct}% ${severityLabel}`}
                    >
                      <span className={`${dotBase} ${dotColor}`} />
                      <div className="min-w-0 flex-1">
                        <p className={textBase}>
                          <strong className="not-italic font-semibold">{alert.name}</strong>
                          {alert.severity === 'over'
                            ? <> — {alert.pct}% vol <span className="text-[var(--ink-3)]">({fmt(alert.spent)} van {fmt(alert.limit)})</span></>
                            : <> is bijna vol — {alert.pct}% <span className="text-[var(--ink-3)]">({fmt(alert.spent)} van {fmt(alert.limit)})</span></>
                          }
                        </p>
                        {freedomTime && (
                          <p className="text-[12px] italic text-[var(--ink-3)]">
                            {fmt(overAmount)} over — {freedomTime.formattedDagen} ingeleverd
                          </p>
                        )}
                      </div>
                      <MoveRight className={arrowClasses} />
                    </button>
                  )
                })}

                {/* 6. Ongecategoriseerd — klikbaar, opent categoriseer-modal */}
                {showUncategorized && (
                  <button
                    type="button"
                    onClick={onUncategorizedClick}
                    className={rowInteractive}
                    aria-label={`${uncategorizedCount} ${uncategorizedCount === 1 ? 'transactie' : 'transacties'} zonder categorie — bekijken`}
                  >
                    <span className={`${dotBase} bg-[var(--kern)]`} />
                    <div className="min-w-0 flex-1">
                      <p className={textBase}>
                        <strong className="not-italic font-semibold">{uncategorizedCount} {uncategorizedCount === 1 ? 'transactie' : 'transacties'} zonder categorie</strong> — {fmt(uncategorizedTotal)}
                      </p>
                    </div>
                    <MoveRight className={arrowClasses} />
                  </button>
                )}

                {/* 7. Alles op schema — positieve feedback, alleen als lijst anders leeg is */}
                {showAllOnSchedule && (
                  <div className={rowBase}>
                    <span className={`${dotBase} bg-positive`} />
                    <div className="min-w-0 flex-1">
                      <p className={textBase}>
                        Alle budgetten op schema
                      </p>
                    </div>
                  </div>
                )}

                {/* "…en N meer" — als hubAlertsVisible is ingekort */}
                {hubAlertsExtra > 0 && (
                  <p className="text-[11px] italic text-[var(--ink-3)] pl-3.5 py-2">
                    en {hubAlertsExtra} meer…
                  </p>
                )}
              </div>
            </div>
          )
        })()}

        {/* Blok 3: Footer — Vraag Will (right-aligned, consistent ritme met collapsed header) */}
        <div className="mt-3 border-t border-[var(--border-ed)] pt-2 flex items-center justify-end">
          <button
            type="button"
            onClick={() => openWithMessage('Analyseer mijn budgetten en geef me de belangrijkste inzichten over overschreden en bijna-volle categorieën')}
            className="min-h-[44px] px-0 font-sans text-[11px] italic text-wil-600 hover:underline"
          >
            Vraag Will voor uitgebreide analyse →
          </button>
        </div>
      </div>
      )}
    </div>
  )
}

export default function BudgetsPage({ initialBudgetId, initialData }: { initialBudgetId?: string; initialData?: BudgetsPageData } = {}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { perspective } = usePerspective()
  const perspectiveSignal = usePerspectiveAbort(perspective)
  const { partnerPrivacy, hiddenCategories } = usePartnerPrivacy()
  const { openWithMessage } = useChatContext()
  const [budgets, setBudgets] = useState<BudgetWithChildren[]>(initialData?.budgets ?? [])
  const [loading, setLoading] = useState(!initialData)
  const [error, setError] = useState<string | null>(null)

  // Pane-state komt rechtstreeks uit `searchParams` (één bron-of-truth, plan §2.7).
  // Geen lokale `selectedBudgetId` meer; openen/sluiten gebeurt via router.replace
  // hieronder. Edit-mode is een composite query-param `?budget=<id>&edit=true`
  // (plan §6.4). Bestaat de id niet (meer) in `budgets`, dan resolved
  // `selectedBudget` simpelweg naar null en rendert de pane niet — geen aparte
  // "valid id"-bewaking nodig.
  const selectedBudgetId = searchParams.get(OVERLAY_QUERY_KEYS.budget)
  const modalStep: 'detail' | 'edit' =
    searchParams.get(OVERLAY_QUERY_KEYS.edit) === 'true' ? 'edit' : 'detail'
  const [viewMode, setViewMode] = useState<'tree' | 'donut' | 'heatmap'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('budgets-view-mode')
      if (stored === 'tree' || stored === 'donut' || stored === 'heatmap') return stored
    }
    return 'tree'
  })
  const [periodMode, setPeriodMode] = useState<'maand' | 'ytd' | '12m'>('maand')
  const [monthDate, setMonthDate] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [spending, setSpending] = useState<Record<string, number>>(initialData?.spending ?? {})
  const [transactions, setTransactions] = useState<{ id?: string; account_id?: string; budget_id: string; amount: number; date: string; description: string; counterparty_name: string | null; is_split_row?: boolean }[]>(initialData?.transactions ?? [])
  const [rollovers, setRollovers] = useState<BudgetRollover[]>(initialData?.rollovers ?? [])
  const [budgetAmounts, setBudgetAmounts] = useState<{ id: string; budget_id: string; effective_from: string; amount: number }[]>(initialData?.budgetAmounts ?? [])
  const [showPlanEditor, setShowPlanEditor] = useState(false)
  const [goals, setGoals] = useState<Goal[]>(initialData?.goals ?? [])
  const [budgetRolloverHistory, setBudgetRolloverHistory] = useState<BudgetRollover[]>([])
  const [loadingRolloverHistory, setLoadingRolloverHistory] = useState(false)
  const [showArchive, setShowArchive] = useState(false)
  const [copyingMonth, setCopyingMonth] = useState(false)
  const [uncategorizedCount, setUncategorizedCount] = useState(initialData?.uncategorizedCount ?? 0)
  const [uncategorizedTotal, setUncategorizedTotal] = useState(initialData?.uncategorizedTotal ?? 0)
  // Volledige uncategorized-transactierijen voor de AICategorizeSheet. We
  // houden ze los van `transactions` (die alleen categorized rijen bevat voor
  // spending-berekening) omdat de sheet álle velden nodig heeft, inclusief
  // counterparty_iban, import_hash en reference.
  type UncatTx = React.ComponentProps<typeof AICategorizeSheet>['transactions'][number]
  const [uncatTx, setUncatTx] = useState<UncatTx[]>([])
  const [showAICategorize, setShowAICategorize] = useState(false)

  // Module-scheiding: de banner is alleen relevant wanneer budgetteren actief
  // is. Op deze pagina is dat doorgaans waar (anders zie je geen budgets-pagina),
  // maar de gate maakt het expliciet en consistent met cash-account-view.
  const [budgetingActive, setBudgetingActive] = useState(true)
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('profiles')
      .select('budgeting_active')
      .single()
      .then(({ data }) => {
        const active = (data as { budgeting_active?: boolean | null } | null)?.budgeting_active
        setBudgetingActive(active !== false)
      })
  }, [])

  // Huidige gebruiker — nodig voor AICategorizeSheet's "alle tijden" scope in
  // het combined-view scenario (geen specifieke accountId op deze pagina).
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null)
    })
  }, [])

  // Compute date range + month count based on period mode
  const { periodStart, periodEnd, periodMonthCount } = useMemo(() => {
    const now = new Date()
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    if (periodMode === 'ytd') {
      const yearStart = new Date(monthDate.getFullYear(), 0, 1)
      const months = monthDate.getMonth() + 1 // Jan=1, Feb=2, etc.
      return {
        periodStart: localDateStr(yearStart),
        periodEnd: localDateStr(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1)),
        periodMonthCount: months,
      }
    }
    if (periodMode === '12m') {
      const twelveMonthsAgo = new Date(currentMonthEnd.getFullYear(), currentMonthEnd.getMonth() - 12, 1)
      return {
        periodStart: localDateStr(twelveMonthsAgo),
        periodEnd: localDateStr(currentMonthEnd),
        periodMonthCount: 12,
      }
    }
    // Default: single month
    return {
      periodStart: localDateStr(monthDate),
      periodEnd: localDateStr(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1)),
      periodMonthCount: 1,
    }
  }, [monthDate, periodMode])

  // Aliases so the rest of the file continues to work without renaming every reference
  const monthStart = periodStart
  const monthEnd = periodEnd

  const loadSpending = useCallback(async (signal?: AbortSignal) => {
    const supabase = createClient()
    // Extra velden (counterparty_iban, import_hash, reference) zijn nodig voor
    // de AICategorizeSheet die op deze pagina via de "ongecategoriseerd"-
    // aandacht-item geopend kan worden. Ze zijn goedkoop en voorkomen een
    // tweede roundtrip puur om dezelfde rijen met meer kolommen op te halen.
    let spendQuery = supabase
      .from('transactions')
      .select('id, account_id, is_split, budget_id, amount, date, description, counterparty_name, transaction_type, counterparty_iban, import_hash, reference')
      .gte('date', monthStart)
      .lt('date', monthEnd)
      .order('date', { ascending: false })

    if (perspective === 'personal') {
      spendQuery = spendQuery.eq('ownership', 'personal')
    }

    const { data } = await spendQuery
    if (signal?.aborted) return // Discard stale results

    if (data && data.length > 0) {
      const map: Record<string, number> = {}
      for (const t of data) {
        if (t.budget_id) {
          map[t.budget_id] = (map[t.budget_id] ?? 0) + Math.abs(Number(t.amount))
        }
      }

      // Add spending from split transactions
      const splitTxIds = data.filter(t => t.is_split).map(t => t.id)
      let splitRows: typeof transactions = []
      if (splitTxIds.length > 0) {
        const { data: splits } = await supabase
          .from('transaction_splits')
          .select('transaction_id, budget_id, amount, transactions(id, account_id, date, description, counterparty_name)')
          .in('transaction_id', splitTxIds)
        if (splits) {
          for (const s of splits) {
            if (s.budget_id) {
              map[s.budget_id] = (map[s.budget_id] ?? 0) + Math.abs(Number(s.amount))
            }
          }
          splitRows = (splits as unknown as Array<{
            transaction_id: string
            budget_id: string | null
            amount: number
            transactions: { id: string; account_id: string; date: string; description: string; counterparty_name: string | null } | null
          }>)
            .filter(s => s.budget_id && s.transactions)
            .map(s => ({
              id: s.transaction_id,
              account_id: (s.transactions as { account_id: string }).account_id,
              budget_id: s.budget_id as string,
              amount: s.amount,
              date: (s.transactions as { date: string }).date,
              description: (s.transactions as { description: string }).description,
              counterparty_name: (s.transactions as { counterparty_name: string | null }).counterparty_name,
              is_split_row: true,
            }))
        }
      }

      if (signal?.aborted) return // Discard stale results after split query

      setSpending(map)
      setTransactions([
        ...data.filter(t => t.budget_id) as typeof transactions,
        ...splitRows,
      ])

      // Compute uncategorized expenses (no budget_id, not a transfer, not income)
      const uncategorized = data.filter(
        (t) =>
          !t.budget_id &&
          !t.is_split &&
          t.transaction_type !== 'transfer' &&
          t.transaction_type !== 'income' &&
          Number(t.amount) < 0,
      )
      setUncategorizedCount(uncategorized.length)
      setUncategorizedTotal(
        uncategorized.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0),
      )
      // Volledige rijen voor de AICategorizeSheet — dezelfde shape als in
      // cash-account-view.tsx wordt doorgegeven aan de sheet.
      setUncatTx(
        uncategorized.map((t) => ({
          id: t.id as string,
          date: t.date as string,
          description: (t.description ?? '') as string,
          counterparty_name: (t.counterparty_name ?? null) as string | null,
          counterparty_iban: ((t as { counterparty_iban?: string | null }).counterparty_iban ?? null) as string | null,
          amount: Number(t.amount),
          import_hash: ((t as { import_hash?: string | null }).import_hash ?? null) as string | null,
          budget_id: null,
          reference: ((t as { reference?: string | null }).reference ?? null) as string | null,
        }))
      )
    } else {
      if (signal?.aborted) return
      setSpending({})
      setTransactions([])
      setUncategorizedCount(0)
      setUncategorizedTotal(0)
      setUncatTx([])
    }

    // Fetch rollovers for the current month period
    const currentPeriod = formatPeriod(monthDate)
    const { data: rolloverData } = await supabase
      .from('budget_rollovers')
      .select('*')
      .eq('period', currentPeriod)
    if (signal?.aborted) return // Discard stale results

    // Fetch budget amount overrides
    const { data: amountsData } = await supabase
      .from('budget_amounts')
      .select('*')
    if (signal?.aborted) return
    if (amountsData) setBudgetAmounts(amountsData as { id: string; budget_id: string; effective_from: string; amount: number }[])

    // Auto-compute rollovers if none exist for the current period
    if (!rolloverData || rolloverData.length === 0) {
      const prevPeriod = getPreviousPeriod(currentPeriod)
      const prevMonthDate = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1)
      const prevStart = localDateStr(prevMonthDate)
      const prevEnd = localDateStr(monthDate)

      // Fetch previous month rollovers and spending
      const [prevRolloversRes, prevTxRes, budgetsForRolloverRes] = await Promise.all([
        supabase.from('budget_rollovers').select('*').eq('period', prevPeriod),
        supabase.from('transactions').select('id, is_split, budget_id, amount').gte('date', prevStart).lt('date', prevEnd),
        supabase.from('budgets').select('id, default_limit, rollover_type, parent_id').not('parent_id', 'is', null),
      ])

      const prevRollovers = (prevRolloversRes.data ?? []) as BudgetRollover[]
      const prevTx = prevTxRes.data ?? []
      const childBudgets = budgetsForRolloverRes.data ?? []

      // Calculate previous month spending per budget
      const prevSpending: Record<string, number> = {}
      for (const t of prevTx) {
        if (t.budget_id) {
          prevSpending[t.budget_id] = (prevSpending[t.budget_id] ?? 0) + Math.abs(Number(t.amount))
        }
      }

      // Add spending from split transactions (previous month)
      const prevSplitTxIds = prevTx.filter(t => t.is_split).map(t => t.id)
      if (prevSplitTxIds.length > 0) {
        const { data: prevSplits } = await supabase
          .from('transaction_splits')
          .select('budget_id, amount')
          .in('transaction_id', prevSplitTxIds)
        if (prevSplits) {
          for (const s of prevSplits) {
            if (s.budget_id) {
              prevSpending[s.budget_id] = (prevSpending[s.budget_id] ?? 0) + Math.abs(Number(s.amount))
            }
          }
        }
      }

      // Only compute rollovers if there was spending data in the previous month
      if (prevTx.length > 0) {
        const newRollovers: { budget_id: string; period: string; carried_amount: number; rollover_type: string }[] = []

        for (const budget of childBudgets) {
          if (budget.rollover_type === 'reset') continue
          const prevCarry = getCarriedAmount(prevRollovers, prevPeriod)
          const { carry } = computeRollover(
            Number(budget.default_limit),
            prevSpending[budget.id] ?? 0,
            prevCarry,
            budget.rollover_type ?? 'reset',
          )
          if (carry > 0) {
            newRollovers.push({
              budget_id: budget.id,
              period: currentPeriod,
              carried_amount: carry,
              rollover_type: budget.rollover_type ?? 'reset',
            })
          }
        }

        if (newRollovers.length > 0) {
          await supabase.from('budget_rollovers').insert(newRollovers)
          const { data: freshRollovers } = await supabase
            .from('budget_rollovers')
            .select('*')
            .eq('period', currentPeriod)
          setRollovers((freshRollovers ?? []) as BudgetRollover[])
          return
        }
      }
    }

    setRollovers((rolloverData ?? []) as BudgetRollover[])
  }, [monthStart, monthEnd, monthDate, perspective])

  const loadBudgets = useCallback(async (signal?: AbortSignal) => {
    try {
      const supabase = createClient()
      let query = supabase
        .from('budgets')
        .select('*')
        .eq('is_archived', false)
        .order('sort_order', { ascending: true })

      // Filter by perspective: personal shows only own budgets, household shows all
      if (perspective === 'personal') {
        query = query.eq('ownership', 'personal')
      }

      const { data, error: fetchError } = await query

      if (signal?.aborted) return // Discard stale results
      if (fetchError) throw fetchError

      if (!data || data.length === 0) {
        await seedBudgets(supabase)
        return
      }

      // Apply privacy filtering in household mode (Feature #537)
      let filteredBudgetData = data as Budget[]
      if (perspective === 'household') {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (signal?.aborted) return
          if (user) {
            const ppRes = await fetch('/api/household/partner-privacy')
            if (ppRes.ok) {
              const ppData = await ppRes.json()
              if (ppData.partnerPrivacy?.budgets === 'hidden') {
                filteredBudgetData = filteredBudgetData.filter(
                  b => b.user_id === user.id || b.ownership === 'shared'
                )
              }
            }
          }
        } catch { /* non-critical */ }
      }

      const parents = filteredBudgetData.filter((b) => !b.parent_id)
      const children = filteredBudgetData.filter((b) => !!b.parent_id)

      const tree: BudgetWithChildren[] = parents.map((parent) => ({
        ...parent,
        children: children
          .filter((c) => c.parent_id === parent.id)
          .sort((a, b) => a.sort_order - b.sort_order),
      }))

      setBudgets(tree)
    } catch (err) {
      console.error('Error loading budgets:', err)
      if (!signal?.aborted) setError('Kon budgetten niet laden. Probeer het opnieuw.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [perspective])

  const loadGoals = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('goals')
      .select('id, name, goal_type, target_value, current_value, target_date, icon, color, is_completed, budget_id')
      .order('sort_order', { ascending: true })
    if (data) setGoals(data as Goal[])
  }, [])

  async function seedBudgets(supabase: ReturnType<typeof createClient>) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Guard: check if budgets already exist (race condition protection)
    const { count } = await supabase.from('budgets').select('id', { count: 'exact', head: true })
    if (count && count > 0) { await loadBudgets(); return }

    const defaults = getDefaultBudgets()

    for (const parent of defaults) {
      const { data: parentData, error: parentError } = await supabase
        .from('budgets')
        .upsert({
          user_id: user.id,
          name: parent.name,
          slug: parent.slug,
          icon: parent.icon,
          description: parent.description,
          default_limit: parent.default_limit,
          budget_type: parent.budget_type,
          is_essential: parent.is_essential,
          priority_score: parent.priority_score,
          sort_order: parent.sort_order,
        }, { onConflict: 'user_id, slug' })
        .select('id')
        .single()

      if (parentError || !parentData) continue

      if (parent.children) {
        const childRows = parent.children.map((child, idx) => ({
          user_id: user.id,
          parent_id: parentData.id,
          name: child.name,
          slug: child.slug,
          icon: child.icon,
          description: child.description,
          default_limit: child.default_limit,
          budget_type: parent.budget_type,
          sort_order: idx,
        }))

        await supabase.from('budgets').upsert(childRows, { onConflict: 'user_id, slug' })
      }
    }

    await loadBudgets()
  }

  // Track whether we should skip the initial fetch (when server data was provided)
  const skipInitialFetch = useRef(!!initialData)

  useEffect(() => {
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false
      return
    }
    const signal = perspectiveSignal
    loadBudgets(signal)
    loadGoals()
  }, [loadBudgets, loadGoals, perspectiveSignal])

  // Run loadSpending independently — no longer gated on loadBudgets completing.
  // loadSpending has no dependency on budgets state, so it can fetch in parallel.
  const skipInitialSpending = useRef(!!initialData)
  useEffect(() => {
    if (skipInitialSpending.current) {
      skipInitialSpending.current = false
      return
    }
    const signal = perspectiveSignal
    loadSpending(signal)
  }, [loadSpending, perspectiveSignal])

  useEffect(() => {
    if (!selectedBudgetId) { setBudgetRolloverHistory([]); return }
    setLoadingRolloverHistory(true)
    const supabase = createClient()
    supabase
      .from('budget_rollovers')
      .select('id, budget_id, period, carried_amount, rollover_type, created_at')
      .eq('budget_id', selectedBudgetId)
      .order('period', { ascending: false })
      .then(({ data }) => {
        setBudgetRolloverHistory((data ?? []) as BudgetRollover[])
        setLoadingRolloverHistory(false)
      })
  }, [selectedBudgetId])

  // Embedded usage (legacy `initialBudgetId` prop) — schrijf de id naar de URL
  // zodat de URL ook in dat geval de bron-of-truth is. Geen lokale state nodig.
  // Eenmalige redirect bij mount of als `initialBudgetId` wijzigt; `searchParams`
  // staat bewust niet in deps (de URL-wijziging zou anders zelf een re-run
  // veroorzaken die de bedoelde state direct zou overschrijven).
  const hasInitialRedirected = useRef(false)
  useEffect(() => {
    if (!initialBudgetId) return
    if (hasInitialRedirected.current) return
    hasInitialRedirected.current = true
    router.replace(`${pathname}?${OVERLAY_QUERY_KEYS.budget}=${initialBudgetId}`, { scroll: false })
  }, [initialBudgetId, router, pathname])

  // Pane open/sluit/stap-toggle — alle drie schrijven naar de URL en triggeren
  // zo een re-render van deze component (selectedBudgetId/modalStep komen uit
  // searchParams). `router.replace` ipv `push` om history-vervuiling te voorkomen
  // (plan §8.2): de gebruiker moet één browser-back-klik = één pane-stap zien.
  //
  // Pathname-preserverend: BudgetsClient wordt zowel standalone (`/core/budgets`)
  // als embedded (`/core/assets/cash?tab=budgetteren`) gerenderd. Hardcoded
  // `/core/budgets`-redirects zouden bij embed de host-pagina ontmounten en
  // de in-app bottom-bar wegvagen. Daarom: huidige pathname behouden en alleen
  // de pane-gerelateerde query-params bijwerken.
  const buildPaneUrl = useCallback((mutate: (params: URLSearchParams) => void) => {
    const next = new URLSearchParams(searchParams.toString())
    mutate(next)
    const qs = next.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }, [pathname, searchParams])

  const openBudgetModal = useCallback((id: string) => {
    router.replace(buildPaneUrl((p) => {
      p.set(OVERLAY_QUERY_KEYS.budget, id)
      p.delete(OVERLAY_QUERY_KEYS.edit)
    }), { scroll: false })
  }, [router, buildPaneUrl])

  const closeBudgetModal = useCallback(() => {
    router.replace(buildPaneUrl((p) => {
      p.delete(OVERLAY_QUERY_KEYS.budget)
      p.delete(OVERLAY_QUERY_KEYS.edit)
    }), { scroll: false })
  }, [router, buildPaneUrl])

  // BudgetPlanEditorSheet — getriggerd door `?planEditor=true` (gezet door de
  // in-app bottom-bar "Plan"-knop). Bij sluiten halen we alleen die ene param
  // weg en behouden we de rest van de URL (zoals `?tab=budgetteren` op de
  // cash-categorie-pagina). Geen vaste path-redirect zoals closeBudgetModal,
  // want deze sheet kan vanuit meerdere routes geopend zijn.
  const closePlanEditor = useCallback(() => {
    setShowPlanEditor(false)
    const next = new URLSearchParams(searchParams.toString())
    if (!next.has(OVERLAY_QUERY_KEYS.planEditor)) return
    next.delete(OVERLAY_QUERY_KEYS.planEditor)
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [router, pathname, searchParams])

  // Open de sheet zodra `?planEditor=true` in de URL staat. De effect blijft
  // idempotent: bij sluiten via `closePlanEditor` wordt de param verwijderd,
  // dus deze effect heropent niets. Wel zichtbaar wanneer de gebruiker via
  // de bottom-bar opnieuw op "Plan" tikt — searchParams wisselt en setShow
  // wordt opnieuw aangeroepen.
  useEffect(() => {
    if (searchParams.get(OVERLAY_QUERY_KEYS.planEditor) === 'true') {
      setShowPlanEditor(true)
    }
  }, [searchParams])

  // "Nieuw budget" pane — getriggerd door `?newBudget=true`. Bron-of-truth:
  // - "+ Nieuw budget"-CTA in de planeditor-toolbar
  // - Redirect vanaf de oude /core/budgets/new route
  // - Direct deeplink met de query-param
  // Werkt zowel op /core/budgets als op /core/assets/cash?tab=budgetteren
  // (waar BudgetsClient als embed draait) — ShellOverlay rendert via portal
  // naar document.body, dus de host-context maakt visueel niet uit.
  const newBudgetOpen = searchParams.get(OVERLAY_QUERY_KEYS.newBudget) === 'true'
  const [budgetFormActions, setBudgetFormActions] = useState<BudgetFormActionsState | null>(null)
  const { addToast } = useToast()

  const closeNewBudgetPane = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString())
    if (!next.has(OVERLAY_QUERY_KEYS.newBudget)) return
    next.delete(OVERLAY_QUERY_KEYS.newBudget)
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    setBudgetFormActions(null)
  }, [router, pathname, searchParams])

  // Aangeroepen vanuit BudgetPlanEditorSheet's "+ Nieuw budget"-CTA. Sluit de
  // planeditor-sheet eerst (sheet-over-pane stapelt focus-traps en geeft een
  // visuele dubbele overlay), zet daarna de query-param zodat de pane opent.
  const openNewBudgetPane = useCallback(() => {
    setShowPlanEditor(false)
    const next = new URLSearchParams(searchParams.toString())
    next.delete(OVERLAY_QUERY_KEYS.planEditor)
    next.set(OVERLAY_QUERY_KEYS.newBudget, 'true')
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }, [router, pathname, searchParams])

  // Edit-toggle binnen pane (plan §6.4): pane blijft open, alleen `?edit=true`
  // wordt toegevoegd of verwijderd. De pane-content rendert detail vs edit
  // op basis van `modalStep`.
  const goToEditStep = useCallback(() => {
    if (!selectedBudgetId) return
    router.replace(buildPaneUrl((p) => {
      p.set(OVERLAY_QUERY_KEYS.budget, selectedBudgetId)
      p.set(OVERLAY_QUERY_KEYS.edit, 'true')
    }), { scroll: false })
  }, [router, selectedBudgetId, buildPaneUrl])

  const goToDetailStep = useCallback(() => {
    if (!selectedBudgetId) return
    router.replace(buildPaneUrl((p) => {
      p.set(OVERLAY_QUERY_KEYS.budget, selectedBudgetId)
      p.delete(OVERLAY_QUERY_KEYS.edit)
    }), { scroll: false })
  }, [router, selectedBudgetId, buildPaneUrl])

  // Find the selected budget (parent or child)
  const selectedBudget = selectedBudgetId
    ? budgets.find((b) => b.id === selectedBudgetId) ??
      budgets.flatMap((b) => b.children).find((c) => c.id === selectedBudgetId) ?? null
    : null
  const selectedParent = selectedBudgetId
    ? budgets.find((b) => b.id === selectedBudgetId || b.children.some((c) => c.id === selectedBudgetId)) ?? null
    : null

  // URL-cleanup bij ongeldige budget-id (verwijderd budget, cross-user deeplink,
  // of stale query). Voorkomt dat `?budget=<id>` in de URL blijft hangen na
  // refresh op zo'n state — pane rendert dan toch niet, dus URL moet matchen.
  // `loading` is false zodra de eerste data-load klaar is; we wachten daarop
  // om een vroege false-negative tijdens initial-render te vermijden.
  useEffect(() => {
    if (selectedBudgetId && !selectedBudget && !loading) {
      router.replace(buildPaneUrl((p) => {
        p.delete(OVERLAY_QUERY_KEYS.budget)
        p.delete(OVERLAY_QUERY_KEYS.edit)
      }), { scroll: false })
    }
  }, [selectedBudgetId, selectedBudget, loading, router, buildPaneUrl])
  // Siblings for ordering: parents of same type, or children of same parent
  const selectedSiblings: Budget[] = selectedBudget
    ? selectedBudget.parent_id
      ? (selectedParent?.children ?? [])
      : budgets.filter((b) => b.budget_type === selectedBudget.budget_type)
    : []

  function prevMonth() {
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  }

  function nextMonth() {
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  }

  function toggleViewMode(mode: 'tree' | 'donut' | 'heatmap') {
    setViewMode(mode)
    localStorage.setItem('budgets-view-mode', mode)
  }

  function getSpent(b: Budget): number {
    return spending[b.id] ?? 0
  }

  function getParentSpent(parent: BudgetWithChildren): number {
    if (parent.children.length === 0) return getSpent(parent)
    return parent.children.reduce((sum, c) => sum + getSpent(c), 0)
  }

  // Pre-indexed lookups: O(1) access instead of O(N) filter on every call.
  const budgetAmountsIndex = useMemo(() => {
    const idx: Record<string, { budget_id: string; effective_from: string; amount: number }[]> = {}
    for (const a of budgetAmounts) {
      if (!idx[a.budget_id]) idx[a.budget_id] = []
      idx[a.budget_id].push(a)
    }
    return idx
  }, [budgetAmounts])

  const rolloversIndex = useMemo(() => {
    const idx: Record<string, BudgetRollover[]> = {}
    for (const r of rollovers) {
      if (!idx[r.budget_id]) idx[r.budget_id] = []
      idx[r.budget_id].push(r)
    }
    return idx
  }, [rollovers])

  const currentPeriodLabel = useMemo(() => formatPeriod(monthDate), [monthDate])
  const displayDate = useMemo(() => localDateStr(monthDate), [monthDate])

  function getEffectiveLimit(budget: Budget): number {
    const budgetRollovers = rolloversIndex[budget.id] ?? []
    const carry = getCarriedAmount(budgetRollovers, currentPeriodLabel)

    // Check budget_amounts for period-specific limit override
    const applicable = (budgetAmountsIndex[budget.id] ?? [])
      .filter(a => a.effective_from <= displayDate)
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from))

    const baseLimit = applicable.length > 0
      ? Number(applicable[0].amount)
      : Number(budget.default_limit)

    // For multi-month modes, scale the base limit by the number of months.
    // Rollovers only apply to single-month view — they don't make sense across periods.
    if (periodMonthCount > 1) {
      return baseLimit * periodMonthCount
    }

    return baseLimit + carry
  }

  function getParentEffectiveLimit(parent: BudgetWithChildren): number {
    if (parent.children.length === 0) return getEffectiveLimit(parent)
    return parent.children.reduce((sum, c) => sum + getEffectiveLimit(c), 0)
  }

  function getBudgetCarry(budget: Budget): number {
    const budgetRollovers = rolloversIndex[budget.id] ?? []
    return getCarriedAmount(budgetRollovers, currentPeriodLabel)
  }

  async function copyFromLastMonth() {
    if (copyingMonth) return
    setCopyingMonth(true)
    const supabase = createClient()
    const prevPeriod = getPreviousPeriod(formatPeriod(monthDate))
    const prevDate = `${prevPeriod}-01`
    const currentDate = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-01`

    // Read all budget_amounts from previous month
    const { data: prevAmounts } = await supabase
      .from('budget_amounts')
      .select('budget_id, amount')
      .eq('effective_from', prevDate)

    if (prevAmounts && prevAmounts.length > 0) {
      // Delete existing current-month amounts for these budgets
      const budgetIds = prevAmounts.map(a => a.budget_id)
      await supabase.from('budget_amounts').delete()
        .in('budget_id', budgetIds)
        .eq('effective_from', currentDate)

      // Insert previous month's amounts for current month
      await supabase.from('budget_amounts').insert(
        prevAmounts.map(a => ({
          budget_id: a.budget_id,
          effective_from: currentDate,
          amount: Number(a.amount),
        }))
      )

      await loadSpending()
    }
    setCopyingMonth(false)
  }

  const incomeBudgets = budgets.filter((b) => b.budget_type === 'income')
  const expenseBudgets = budgets.filter((b) => b.budget_type === 'expense')
  const savingsBudgets = budgets.filter((b) => b.budget_type === 'savings')
  const debtBudgets = budgets.filter((b) => b.budget_type === 'debt')
  const archiveBudgets = budgets.filter((b) => b.budget_type === 'archive')

  const totalIncome = incomeBudgets.reduce((sum, b) => sum + getParentEffectiveLimit(b), 0)
  const totalIncomeActual = incomeBudgets.reduce((sum, b) => sum + getParentSpent(b), 0)
  const totalExpenseBudget = expenseBudgets.reduce((sum, b) => sum + getParentEffectiveLimit(b), 0)
  const totalExpenseSpent = expenseBudgets.reduce((sum, b) => sum + getParentSpent(b), 0)
  const totalSavingsBudget = savingsBudgets.reduce((sum, b) => sum + getParentEffectiveLimit(b), 0)
  const totalSavingsActual = savingsBudgets.reduce((sum, b) => sum + getParentSpent(b), 0)
  const totalDebtBudget = debtBudgets.reduce((sum, b) => sum + getParentEffectiveLimit(b), 0)
  const totalDebtActual = debtBudgets.reduce((sum, b) => sum + getParentSpent(b), 0)

  const totalAllocated = totalExpenseBudget + totalSavingsBudget + totalDebtBudget
  const teVerdelen = totalIncome - totalAllocated
  const dekkingsgraad = totalIncome > 0 ? (totalAllocated / totalIncome) * 100 : 0

  // G3: Budget insights voor AI-kaart (overschreden + bijna vol)
  const childBudgetsFlat = budgets.flatMap(g =>
    g.children.length > 0 ? g.children : (g.budget_type !== 'income' ? [g as Budget] : [])
  )
  const overschredenInzichten = childBudgetsFlat
    .filter(b => {
      const lim = getEffectiveLimit(b)
      return lim > 0 && (spending[b.id] ?? 0) > lim
    })
    .map(b => {
      const lim = getEffectiveLimit(b)
      const spent = spending[b.id] ?? 0
      return { id: b.id, name: b.name, spent, limit: lim, pct: Math.round((spent / lim) * 100) }
    })
  const bijnaVolInzichten = childBudgetsFlat
    .filter(b => {
      const lim = getEffectiveLimit(b)
      const pct = lim > 0 ? (spending[b.id] ?? 0) / lim : 0
      return pct >= 0.8 && pct < 1.0
    })
    .map(b => {
      const lim = getEffectiveLimit(b)
      const spent = spending[b.id] ?? 0
      return { id: b.id, name: b.name, spent, limit: lim, pct: Math.round((spent / lim) * 100) }
    })
  const hasAIInsights = overschredenInzichten.length > 0 || bijnaVolInzichten.length > 0

  // G3-hub: schema-teller over álle hoofdbudgetten (expense, income, savings,
  // debt), minus archive en de "Eigen rekening"-bucket. Per type verschilt de
  // definitie van "op schema":
  //   - expense / debt  → op schema als uitgegeven ≤ limiet (binnen budget blijven)
  //   - income / savings → op schema als werkelijk ≥ limiet (doel behaald)
  const schemaParents = budgets.filter(b =>
    b.budget_type !== 'archive' &&
    b.slug !== BUDGET_SLUGS.EIGEN_REKENING
  )
  const parentBudgetsCount = schemaParents.length
  const opSchemaCount = schemaParents.filter(b => {
    const lim = getParentEffectiveLimit(b)
    if (lim <= 0) return false
    const actual = getParentSpent(b)
    if (b.budget_type === 'expense' || b.budget_type === 'debt') {
      return actual <= lim
    }
    // income, savings: doel behalen
    return actual >= lim
  }).length

  // G3-hub: combined alert list (overschreden first, then bijna vol), max 5
  const hubAlerts = [
    ...overschredenInzichten.map(i => ({ ...i, severity: 'over' as const })),
    ...bijnaVolInzichten.map(i => ({ ...i, severity: 'bijna' as const })),
  ]
  const hubAlertsVisible = hubAlerts.slice(0, 5)
  const hubAlertsExtra = hubAlerts.length - hubAlertsVisible.length

  // F2-09: beschikbaar per sub-budget (effectieve limiet incl. rollover − uitgegeven)
  const beschikbaarMap: Record<string, number> = {}
  for (const group of budgets) {
    const items = group.children.length > 0 ? group.children : [group as Budget]
    for (const b of items) {
      beschikbaarMap[b.id] = getEffectiveLimit(b) - (spending[b.id] ?? 0)
    }
  }

  // F2-10: dekkingsratio werkelijk ontvangen inkomen vs. verwacht inkomen
  const coverageRatio = totalIncome > 0 ? Math.min(1, totalIncomeActual / totalIncome) : 1

  const monthLabel = monthDate.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })

  if (loading) {
    return (
      <div className="py-3 sm:py-8">
        {/* Month selector skeleton */}
        <section className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-3 sm:p-6">
          <div className="mb-3 sm:mb-6 flex items-center justify-between gap-2">
            <div className="h-9 w-9 animate-pulse rounded-lg bg-[var(--subtle)]" />
            <div className="h-6 w-36 animate-pulse rounded-md bg-[var(--subtle)]" />
            <div className="h-9 w-9 animate-pulse rounded-lg bg-[var(--subtle)]" />
            <div className="ml-auto hidden h-8 w-36 animate-pulse rounded-[var(--r)] bg-[var(--subtle)] sm:block" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-4 sm:grid-cols-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className="h-3 w-16 animate-pulse rounded bg-[var(--subtle)]" />
                <div className="h-7 w-24 animate-pulse rounded-md bg-[var(--subtle)]" />
                <div className="h-3 w-20 animate-pulse rounded bg-[var(--subtle)]" />
              </div>
            ))}
          </div>
        </section>

        {/* View mode toggle skeleton */}
        <div className="mt-2 sm:mt-6 flex items-center gap-2">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-8 w-20 animate-pulse rounded-[var(--r)] bg-[var(--subtle)]" />
          ))}
        </div>

        {/* Budget tree skeleton */}
        <div className="mt-6 space-y-4">
          {[1,2,3].map(group => (
            <div key={group} className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
              {/* Group header */}
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 animate-pulse rounded-lg bg-[var(--subtle)]" />
                  <div>
                    <div className="h-4 w-28 animate-pulse rounded bg-[var(--subtle)]" />
                    <div className="mt-1 h-3 w-20 animate-pulse rounded bg-[var(--subtle)]" />
                  </div>
                </div>
                <div className="h-5 w-16 animate-pulse rounded bg-[var(--subtle)]" />
              </div>
              {/* Progress bar skeleton */}
              <div className="mb-4 h-1.5 w-full animate-pulse rounded-full bg-[var(--subtle)]" />
              {/* Child rows */}
              <div className="space-y-2 pl-4">
                {[1,2,3].map(child => (
                  <div key={child} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 animate-pulse rounded-md bg-[var(--subtle)]" />
                      <div className="h-4 w-24 animate-pulse rounded bg-[var(--subtle)]" />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-20 animate-pulse rounded-full bg-[var(--subtle)]" />
                      <div className="h-4 w-14 animate-pulse rounded bg-[var(--subtle)]" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-5 sm:py-12">
        <div className="rounded-[var(--r-lg)] border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-700">{error}</p>
          <button onClick={() => { setError(null); setLoading(true); loadBudgets() }} className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
            Opnieuw proberen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="py-3 sm:py-8">
      {/* Privacy notice for hidden budget data (Feature #537) */}
      {perspective === 'household' && hiddenCategories.includes('budgets') && (
        <div className="mb-4">
          <PrivacyHiddenNotice hiddenCategories={hiddenCategories} forCategories={['budgets']} />
        </div>
      )}

      {/* Editorial header — blueprint stijl (Type App: Budgetteren).
          Toont kicker met streep, headline met italic-em, hoofdcijfer 'Te besteden'
          met halve transparante streep (Kern-200) en italic Source Serif sub-meta. */}
      <BudgetEditorialHeader
        monthLabel={monthLabel}
        teVerdelen={teVerdelen}
        totalIncome={totalIncome}
        totalIncomeActual={totalIncomeActual}
        totalActualOutflow={totalExpenseSpent + totalSavingsActual + totalDebtActual}
      />

      {/* Month selector + KPI-strip — figures-strip-stijl met top+bottom borders.
          Top-rij: maand-nav + periode-toggle + rapport + kopieer-knoppen.
          Onder: 4-koloms KPI-strip (Inkomen/Uitgaven/Sparen/Schulden) met
          dividers tussen kolommen, kicker-kleur, x/x format en sub-meta. */}
      <section className="border-t border-b border-[var(--ink)] bg-[var(--paper)]">
        {/* Top action-bar: maand-nav + periode-toggle + rapport + kopieer */}
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 sm:px-4 sm:py-3 border-b border-[var(--rule-soft)] flex-wrap">
          {/* Maand-nav links */}
          <div className="flex items-center gap-1">
            {periodMode === 'maand' && (
              <button
                onClick={prevMonth}
                aria-label="Vorige maand"
                className="p-1.5 text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <h2
              className="px-2 text-base font-bold capitalize text-[var(--ink)] sm:text-lg"
              style={{ fontFamily: 'var(--font-playfair, serif)' }}
            >
              {periodMode === 'ytd'
                ? `${monthDate.getFullYear()} YTD`
                : periodMode === '12m'
                  ? 'Afgelopen 12 maanden'
                  : monthLabel}
            </h2>
            {periodMode === 'maand' && (
              <button
                onClick={nextMonth}
                aria-label="Volgende maand"
                className="p-1.5 text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            )}

            {/* Period toggle pill — donker actief, transparant rest */}
            <div className="ml-2 flex items-center gap-0.5 rounded-full border border-[var(--border-ed)] bg-[var(--bg)] p-0.5">
              {(['maand', 'ytd', '12m'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setPeriodMode(mode)}
                  className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                    periodMode === mode
                      ? 'bg-[var(--ink)] text-[var(--paper)]'
                      : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
                  }`}
                >
                  {mode === 'maand' ? 'Maand' : mode === 'ytd' ? 'YTD' : '12 mnd'}
                </button>
              ))}
            </div>
          </div>

          {/* Rapport + kopieer-knoppen rechts */}
          <div className="hidden sm:flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push(`/rapportages/budget?month=${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`)}
              className="inline-flex items-center gap-1.5 border border-[var(--border-ed)] bg-[var(--bg)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-2)] transition-all hover:shadow-[var(--s0)] hover:-translate-y-px hover:text-[var(--ink)]"
            >
              <FileText className="h-3 w-3" />
              Rapport
            </button>
            {periodMode === 'maand' && (
              <button
                type="button"
                onClick={copyFromLastMonth}
                disabled={copyingMonth}
                title="Kopieer budgetbedragen van vorige maand"
                className="inline-flex items-center gap-1.5 border border-[var(--border-ed)] bg-[var(--bg)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] disabled:opacity-50"
              >
                {copyingMonth ? (
                  <span className="h-3 w-3 animate-spin rounded-full border border-[var(--ink-3)] border-t-transparent" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                Kopieer vorige maand
              </button>
            )}
          </div>
        </div>

        {/* 4-koloms KPI-strip: Inkomen / Uitgaven / Sparen / Schulden.
            Format per cell: kicker-kleur (positive/negative/wil/red) UPPERCASE,
            hoofd in Playfair 'x / y' (besteed / budget), italic sub-meta.
            Sparen krijgt halve transparante streep (winner). Cellen met data
            zijn klikbaar (deeplink naar #-anchor van detail-tree). */}
        <div className="grid grid-cols-2 sm:grid-cols-4">
          <BudgetKpiCell
            kicker="Inkomen"
            kickerColor="var(--positive)"
            actual={totalIncomeActual}
            target={totalIncome}
            actionLabel="ontvangen"
            href={incomeBudgets.length > 0 ? '#inkomen' : undefined}
          />
          <BudgetKpiCell
            kicker="Uitgaven"
            kickerColor="var(--negative)"
            actual={totalExpenseSpent}
            target={totalExpenseBudget}
            actionLabel="besteed"
            href={expenseBudgets.length > 0 ? '#uitgaven' : undefined}
          />
          <BudgetKpiCell
            kicker="Sparen"
            kickerColor="var(--color-wil-600)"
            actual={totalSavingsActual}
            target={totalSavingsBudget}
            actionLabel="gespaard"
            tagline="vrijheid opbouwen"
            taglineColor="var(--color-wil-600)"
            highlight
            href={savingsBudgets.length > 0 ? '#sparen' : undefined}
          />
          <BudgetKpiCell
            kicker="Schulden"
            kickerColor="var(--negative)"
            actual={totalDebtActual}
            target={totalDebtBudget}
            actionLabel="afgelost"
            tagline="vrijheid terugkopen"
            taglineColor="var(--negative)"
            href={debtBudgets.length > 0 ? '#schulden' : undefined}
          />
        </div>

      </section>

      {/* G3: Budget Hub — geconsolideerde dropdown (Allocatie + Aandacht + Alerts + Inzichten) */}
      {budgetingActive && (
        <BudgetHub
          hubAlertsVisible={hubAlertsVisible}
          hubAlertsExtra={hubAlertsExtra}
          dekkingsgraad={dekkingsgraad}
          opSchemaCount={opSchemaCount}
          parentBudgetsCount={parentBudgetsCount}
          formatCurrency={formatCurrency}
          openWithMessage={openWithMessage}
          totalIncome={totalIncome}
          teVerdelen={teVerdelen}
          periodMode={periodMode}
          onOpenPlanEditor={() => setShowPlanEditor(true)}
          onOpenBudget={(id) => openBudgetModal(id)}
          uncategorizedCount={uncategorizedCount}
          uncategorizedTotal={uncategorizedTotal}
          onUncategorizedClick={() => setShowAICategorize(true)}
          coverageRatio={coverageRatio}
          totalIncomeActual={totalIncomeActual}
          budgetingActive={budgetingActive}
        />
      )}

      {/* View toggle + New budget button */}
      <div className="mt-2 sm:mt-6 flex items-center justify-between">
        <div className="flex items-center gap-0.5 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-0.5">
          <button
            onClick={() => toggleViewMode('tree')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'tree'
                ? 'bg-zinc-900 text-white'
                : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
            }`}
          >
            <GitFork className="h-3.5 w-3.5" />
            Boom
          </button>
          <button
            onClick={() => toggleViewMode('donut')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'donut'
                ? 'bg-zinc-900 text-white'
                : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
            }`}
          >
            <CircleDot className="h-3.5 w-3.5" />
            Ring
          </button>
          <button
            onClick={() => toggleViewMode('heatmap')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'heatmap'
                ? 'bg-zinc-900 text-white'
                : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Heatmap
          </button>
        </div>

        {/* Spiegelt de view-toggle pill-group: zelfde wrapper-shape
            (rounded-lg border bg-paper p-0.5) met daarbinnen één pill in
            de niet-actieve toggle-stijl. ink-2 tekst (tikje feller dan de
            ink-3 op echte toggles) signaleert dat dit een ACTIE is, geen
            toggle-state. Beide groups lezen nu als gelijkwaardige
            control-strips naast elkaar. */}
        <div className="flex items-center gap-0.5 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-0.5">
          <button
            type="button"
            onClick={() => setShowPlanEditor(true)}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] hover:text-[var(--ink)] transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
            Plan bewerken
          </button>
        </div>
      </div>

      {/* Budget groups */}
      {viewMode === 'tree' ? (
        <>
          {incomeBudgets.length > 0 && (
            <div id="inkomen" className="mt-4 sm:mt-8 scroll-mt-20">
              <h3 className="mb-4 label-editorial text-[var(--ink-2)]">Inkomen</h3>
              <BudgetTree
                groups={incomeBudgets}
                spending={spending}
                budgetType="income"
                onNavigate={(id) => openBudgetModal(id)}
                beschikbaarMap={beschikbaarMap}
              />
            </div>
          )}
          {expenseBudgets.length > 0 && (
            <div id="uitgaven" className="mt-4 sm:mt-8 scroll-mt-20">
              <h3 className="mb-4 label-editorial text-[var(--ink-2)]">Uitgaven</h3>
              <BudgetTree
                groups={expenseBudgets}
                spending={spending}
                budgetType="expense"
                onNavigate={(id) => openBudgetModal(id)}
                beschikbaarMap={beschikbaarMap}
              />
            </div>
          )}
          {savingsBudgets.length > 0 && (
            <div id="sparen" className="mt-4 sm:mt-8 scroll-mt-20">
              <h3 className="mb-4 label-editorial text-[var(--ink-2)]">Sparen <span className="ml-1 font-normal normal-case tracking-normal text-wil-400/70">— vrijheid opbouwen</span></h3>
              <BudgetTree
                groups={savingsBudgets}
                spending={spending}
                budgetType="savings"
                onNavigate={(id) => openBudgetModal(id)}
                beschikbaarMap={beschikbaarMap}
              />
            </div>
          )}
          {debtBudgets.length > 0 && (
            <div id="schulden" className="mt-4 sm:mt-8 scroll-mt-20">
              <h3 className="mb-4 label-editorial text-[var(--ink-2)]">Schulden <span className="ml-1 font-normal normal-case tracking-normal text-red-400/70">— vrijheid terugkopen</span></h3>
              <BudgetTree
                groups={debtBudgets}
                spending={spending}
                budgetType="debt"
                onNavigate={(id) => openBudgetModal(id)}
                beschikbaarMap={beschikbaarMap}
              />
            </div>
          )}
          {archiveBudgets.length > 0 && (
            <div className="mt-4 sm:mt-8">
              <button
                type="button"
                className="mb-4 flex items-center gap-2 label-editorial text-[var(--ink-4)] hover:text-[var(--ink-3)] transition-colors"
                onClick={() => setShowArchive((prev) => !prev)}
              >
                <EyeOff className="h-3.5 w-3.5" />
                Verborgen
                <span className="ml-1 text-[10px] normal-case tracking-normal font-normal text-[var(--ink-4)]">
                  ({archiveBudgets.length} {archiveBudgets.length === 1 ? 'categorie' : 'categorieën'})
                </span>
                <ChevronDown className={`h-3 w-3 transition-transform ${showArchive ? 'rotate-180' : ''}`} />
              </button>
              {showArchive && (
                <BudgetTree
                  groups={archiveBudgets}
                  spending={spending}
                  budgetType="archive"
                  onNavigate={(id) => openBudgetModal(id)}
                />
              )}
            </div>
          )}
        </>
      ) : viewMode === 'heatmap' ? (
        <div className="mt-4 sm:mt-8">
          <BudgetHeatmap
            sections={[
              ...(expenseBudgets.length > 0 ? [{ label: 'Uitgaven', budgetType: 'expense' as const, groups: expenseBudgets }] : []),
              ...(incomeBudgets.length > 0 ? [{ label: 'Inkomen', budgetType: 'income' as const, groups: incomeBudgets }] : []),
              ...(savingsBudgets.length > 0 ? [{ label: 'Sparen', budgetType: 'savings' as const, groups: savingsBudgets }] : []),
              ...(debtBudgets.length > 0 ? [{ label: 'Schulden', budgetType: 'debt' as const, groups: debtBudgets }] : []),
            ] satisfies HeatmapSection[]}
            spending={spending}
            onNavigate={(id) => openBudgetModal(id)}
            beschikbaarMap={beschikbaarMap}
          />
        </div>
      ) : (
        <BudgetDonut
          groups={[...incomeBudgets, ...expenseBudgets, ...savingsBudgets, ...debtBudgets]}
          spending={spending}
          onNavigate={(id) => openBudgetModal(id)}
        />
      )}

      {/* Budget allocation modal */}
      <BudgetPlanEditorSheet
        open={showPlanEditor}
        onClose={closePlanEditor}
        onSaved={() => {
          closePlanEditor()
          loadBudgets()
          loadSpending()
        }}
        onRequestNewBudget={openNewBudgetPane}
        budgets={budgets}
        budgetAmounts={budgetAmounts}
        rollovers={rollovers}
        totalIncome={totalIncome}
        monthDate={monthDate}
        monthlyAverages={initialData?.monthlyAverages ?? {}}
      />

      {/* "Nieuw budget" pane — uitgebreide create-flow met alle parameters
          (icoon, prioriteit, doeltype, eigendoms-keuze, …). Geopend vanuit
          de planeditor-toolbar OR direct deeplink (/core/budgets/new
          redirect). Footer-CTA wordt door BudgetForm gepubliceerd via
          onActionsChange — patroon zoals event-pane-edit.tsx. */}
      {newBudgetOpen && (
        <ShellOverlay
          open={newBudgetOpen}
          onClose={closeNewBudgetPane}
          kind="pane"
          title="Nieuw budget"
          primaryAction={budgetFormActions ? {
            label: 'Opslaan',
            onClick: budgetFormActions.save,
            loading: budgetFormActions.saving,
            disabled: !budgetFormActions.canSave,
          } : undefined}
          secondaryAction={{
            label: 'Annuleren',
            onClick: closeNewBudgetPane,
          }}
        >
          <BudgetForm
            embedded
            parentBudgets={budgets.filter((b) => !b.parent_id)}
            onActionsChange={setBudgetFormActions}
            onSaved={() => {
              closeNewBudgetPane()
              loadBudgets()
              loadSpending()
              addToast({ type: 'success', title: 'Budget aangemaakt' })
            }}
          />
        </ShellOverlay>
      )}

      {/* AI categorize sheet — geopend vanuit de "ongecategoriseerd"-aandacht
          in de Budget Hub. We hergebruiken dezelfde flow als in
          cash-account-view.tsx zodat de gebruiker direct vanaf de budgets-
          pagina transacties kan koppelen zonder naar /core/cash te navigeren. */}
      {showAICategorize && (
        <AICategorizeSheet
          transactions={uncatTx}
          budgets={budgets}
          budgetGroups={budgets.map((b) => ({ parent: b, children: b.children }))}
          onClose={() => setShowAICategorize(false)}
          onSaved={() => {
            setShowAICategorize(false)
            loadBudgets()
            loadSpending()
          }}
          accountId={null}
          monthLabel={monthLabel}
          currentUserId={currentUserId}
        />
      )}


      {/* Budget detail modal */}
      {selectedBudget && modalStep === 'detail' && (
        <BudgetDetailModal
          budget={selectedBudget}
          parent={selectedParent}
          siblings={selectedSiblings}
          spending={spending}
          transactions={transactions}
          allBudgets={budgets}
          rollovers={rollovers}
          monthDate={monthDate}
          getSpent={getSpent}
          getEffectiveLimit={getEffectiveLimit}
          getBudgetCarry={getBudgetCarry}
          goals={goals.filter(g => g.budget_id === selectedBudget?.id)}
          rolloverHistory={budgetRolloverHistory}
          onClose={closeBudgetModal}
          onEdit={goToEditStep}
          onSelectChild={(id) => openBudgetModal(id)}
          onDelete={async () => {
            closeBudgetModal()
            await loadBudgets()
            await loadSpending()
          }}
          onReorder={async () => {
            await loadBudgets()
          }}
          onGoalCreated={async () => {
            await loadGoals()
            await loadSpending()
          }}
        />
      )}


      {/* Budget edit modal */}
      {selectedBudget && modalStep === 'edit' && (
        <BudgetEditModal
          budget={selectedBudget}
          isParent={selectedParent?.id === selectedBudget.id && (selectedParent?.children.length ?? 0) > 0}
          allBudgets={budgets}
          childrenLimitSum={
            selectedParent?.id === selectedBudget.id && (selectedParent?.children.length ?? 0) > 0
              ? selectedParent!.children.reduce((sum, c) => sum + Number(c.default_limit), 0)
              : undefined
          }
          onClose={goToDetailStep}
          onSaved={() => {
            goToDetailStep()
            loadBudgets()
            loadSpending()
          }}
        />
      )}

      {/* NIBUD Benchmark */}
      <CollapsibleSection storageKey="nibud-benchmark" title="NIBUD Benchmark" defaultOpen={false}>
        <NibudBenchmarkSection />
      </CollapsibleSection>
    </div>
  )
}

// ── Budget legend (donut-style, under Sankey) ────────────────


// ── Detail modal donut ring ──────────────────────────────────

function DetailModalDonut({
  spent, limit, remaining, pct, budgetType, colors, hasFreedomData, dailyExpenseRate,
}: {
  spent: number
  limit: number
  remaining: number
  pct: number
  budgetType: BudgetType
  colors: ReturnType<typeof getTypeColors>
  hasFreedomData: boolean
  dailyExpenseRate: number
}) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 600 })
  const overBudget = spent > limit && limit > 0
  const overPositive = overBudget && isOverPositive(budgetType)
  const ratio = limit > 0 ? Math.min(spent / limit, 1) : 0

  const ringSize = 120
  const cx = ringSize / 2
  const cy = ringSize / 2
  const r = 48
  const sw = 8
  const circ = 2 * Math.PI * r
  const cssType = budgetType === 'archive' ? 'other' : budgetType
  const trackColor = `color-mix(in srgb, var(--color-${cssType}-300) 35%, transparent)`
  const fillColor = overBudget
    ? (overPositive ? '#10b981' : '#ef4444')
    : `var(--color-${cssType}-500)`

  return (
    <div ref={ref} className="px-6 py-4">
      {/* Ring chart */}
      <div className="flex flex-col items-center">
        <div className="relative">
          <svg width={ringSize} height={ringSize}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={sw} />
            <circle
              cx={cx} cy={cy} r={r} fill="none" stroke={fillColor} strokeWidth={sw}
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={hasEntered ? circ * (1 - ratio) : circ}
              transform={`rotate(-90 ${cx} ${cy})`}
              style={{ transition: hasEntered ? 'stroke-dashoffset 600ms cubic-bezier(.22,1,.36,1)' : 'none' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className={`font-mono text-2xl font-semibold tabular-nums leading-tight ${
              overBudget ? (overPositive ? 'text-positive' : 'text-negative') : 'text-[var(--ink)]'
            }`}>
              {pct}%
            </p>
            <p className="font-mono text-[10px] text-[var(--ink-4)] tabular-nums leading-normal">
              van {<MaskedAmount value={limit} tone="wil" />}
            </p>
          </div>
        </div>
      </div>

      {/* Compact 2-column under ring */}
      <div className="mt-3 grid grid-cols-2 gap-3 text-center">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--ink-3)]">Besteed</p>
          <p className="mt-0.5 font-mono text-base font-bold tabular-nums text-[var(--ink)]" data-testid="modal-spent">
            {<MaskedAmount value={spent} tone="wil" />}
          </p>
          {hasFreedomData && spent >= 100 && (
            <p className="font-serif text-xs italic text-[var(--ink-3)]" data-testid="modal-spent-freedom">
              ≈ {eurToFreedomTime(spent, dailyExpenseRate).formattedDagen}
            </p>
          )}
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--ink-3)]">
            {remaining >= 0 ? 'Resterend' : (overPositive ? 'Boven doel' : 'Over budget')}
          </p>
          <p className={`mt-0.5 font-mono text-base font-bold tabular-nums ${
            remaining >= 0 ? 'text-positive' : (overPositive ? 'text-positive' : 'text-negative')
          }`} data-testid="modal-remaining">
            {<MaskedAmount value={Math.abs(remaining)} tone="wil" />}
          </p>
          {hasFreedomData && Math.abs(remaining) >= 100 && (
            <p className="font-serif text-xs italic text-[var(--ink-3)]" data-testid="modal-remaining-freedom">
              {remaining >= 0
                ? `nog ${eurToFreedomTime(remaining, dailyExpenseRate).formattedDagen}`
                : (overPositive
                  ? `+${eurToFreedomTime(Math.abs(remaining), dailyExpenseRate).formattedDagen}`
                  : `${eurToFreedomTime(Math.abs(remaining), dailyExpenseRate).formattedDagen} ingeleverd`)
              }
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Budget detail modal ──────────────────────────────────────

function BudgetDetailModal({
  budget,
  parent,
  siblings,
  spending,
  transactions,
  allBudgets,
  rollovers,
  monthDate,
  getSpent,
  getEffectiveLimit,
  getBudgetCarry,
  goals,
  rolloverHistory,
  onClose,
  onEdit,
  onSelectChild,
  onDelete,
  onReorder,
  onGoalCreated,
}: {
  budget: Budget
  parent: BudgetWithChildren | null
  siblings: Budget[]
  spending: Record<string, number>
  transactions: { id?: string; account_id?: string; budget_id: string; amount: number; date: string; description: string; counterparty_name: string | null; is_split_row?: boolean }[]
  allBudgets: BudgetWithChildren[]
  rollovers: BudgetRollover[]
  monthDate: Date
  getSpent: (b: Budget) => number
  getEffectiveLimit: (b: Budget) => number
  getBudgetCarry: (b: Budget) => number
  goals: Goal[]
  rolloverHistory: BudgetRollover[]
  onClose: () => void
  onEdit: () => void
  onSelectChild: (id: string) => void
  onDelete: () => void
  onReorder: () => void
  onGoalCreated?: () => void
}) {
  const { perspective } = usePerspective()
  const { openWithMessage } = useChatContext()
  const { masked } = useMaskedAmounts()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [reordering, setReordering] = useState(false)
  const [showCreateGoalForm, setShowCreateGoalForm] = useState(false)
  const [goalForm, setGoalForm] = useState({ name: '', target_value: '', target_date: '' })
  const [goalSaving, setGoalSaving] = useState(false)
  const [goalError, setGoalError] = useState('')
  const [showRolloverOverride, setShowRolloverOverride] = useState(false)
  const [overrideAmount, setOverrideAmount] = useState('')
  const [overrideSaving, setOverrideSaving] = useState(false)
  const [showForecastExpanded, setShowForecastExpanded] = useState(false)
  const [showForecastModal, setShowForecastModal] = useState(false)
  const [budgetPartnerSplit, setBudgetPartnerSplit] = useState<{ splitMode: SplitMode; mySharePct: number; myName: string; partnerName: string } | null>(null)

  // Fetch household split for shared budget per-partner freedom time
  useEffect(() => {
    if (perspective !== 'household' || budget.ownership !== 'shared') {
      setBudgetPartnerSplit(null)
      return
    }
    const controller = new AbortController()
    async function loadSplit() {
      try {
        const [statusRes, settingsRes] = await Promise.all([
          fetch('/api/household/status', { signal: controller.signal }),
          fetch('/api/household/settings', { signal: controller.signal }),
        ])
        if (controller.signal.aborted) return
        if (!statusRes.ok || !settingsRes.ok) return
        const status = await statusRes.json()
        const settings = await settingsRes.json()
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (controller.signal.aborted) return
        const splitMode: SplitMode = settings.split_mode || 'equal'
        const mySharePct = computeSharePct(
          { splitMode, customSplitPct: settings.custom_split_pct ?? null, primaryPayerId: settings.primary_payer_id ?? null },
          user?.id ?? '',
        )
        const myMember = (status.members ?? []).find((m: { is_current_user: boolean }) => m.is_current_user)
        const partnerMember = (status.members ?? []).find((m: { is_current_user: boolean }) => !m.is_current_user)
        setBudgetPartnerSplit({
          splitMode,
          mySharePct,
          myName: myMember?.full_name || 'Jij',
          partnerName: partnerMember?.full_name || 'Partner',
        })
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        // Non-critical
      }
    }
    loadSplit()
    return () => controller.abort()
  }, [perspective, budget.ownership])
  type FullTx = { id: string; account_id: string; budget_id: string | null; date: string; amount: number; description: string; counterparty_name: string | null; counterparty_iban: string | null; is_income: boolean; notes: string | null; category_source: string; is_split?: boolean }
  const [txToEdit, setTxToEdit] = useState<FullTx | null>(null)

  async function openTransaction(id: string) {
    const supabase = createClient()
    const { data } = await supabase
      .from('transactions')
      .select('id, account_id, budget_id, date, amount, description, counterparty_name, counterparty_iban, is_income, notes, category_source, is_split')
      .eq('id', id)
      .single()
    if (data) setTxToEdit(data as FullTx)
  }

  type HistTxRow = { id: string; account_id: string; amount: number; date: string; description: string; counterparty_name: string | null }
  const [selectedHistMonth, setSelectedHistMonth] = useState<string | null>(null)
  const [histMonthTx, setHistMonthTx] = useState<HistTxRow[]>([])
  const [histMonthTxLoading, setHistMonthTxLoading] = useState(false)

  async function selectHistMonth(monthStart: string) {
    if (selectedHistMonth === monthStart) {
      setSelectedHistMonth(null)
      setHistMonthTx([])
      return
    }
    setSelectedHistMonth(monthStart)
    setHistMonthTxLoading(true)
    const supabase = createClient()
    const d = new Date(monthStart)
    const monthEnd = localDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 1))
    const { data } = await supabase
      .from('transactions')
      .select('id, account_id, amount, date, description, counterparty_name')
      .in('budget_id', budgetIds)
      .gte('date', monthStart)
      .lt('date', monthEnd)
      .order('date', { ascending: false })
    setHistMonthTx((data ?? []) as HistTxRow[])
    setHistMonthTxLoading(false)
  }

  async function handleCreateGoal() {
    if (!goalForm.name.trim() || !goalForm.target_value) {
      setGoalError('Naam en doelbedrag zijn verplicht')
      return
    }
    setGoalSaving(true)
    setGoalError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setGoalError('Niet ingelogd'); setGoalSaving(false); return }
    const { error: insertError } = await supabase.from('goals').insert({
      user_id: user.id,
      name: goalForm.name.trim(),
      goal_type: 'savings',
      target_value: parseFloat(goalForm.target_value),
      current_value: 0,
      target_date: goalForm.target_date || null,
      budget_id: budget.id,
      icon: 'Target',
      color: 'teal',
    })
    if (insertError) { setGoalError(insertError.message); setGoalSaving(false); return }
    setGoalSaving(false)
    setShowCreateGoalForm(false)
    setGoalForm({ name: '', target_value: '', target_date: '' })
    onGoalCreated?.()
  }

  async function handleRolloverOverride() {
    if (!overrideAmount) return
    setOverrideSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setOverrideSaving(false); return }
    const period = formatPeriod(monthDate)
    const existingRollover = rolloverHistory.find(r => r.period === period)
    if (existingRollover) {
      await supabase.from('budget_rollovers')
        .update({ carried_amount: parseFloat(overrideAmount) })
        .eq('id', existingRollover.id)
    } else {
      await supabase.from('budget_rollovers').insert({
        user_id: user.id,
        budget_id: budget.id,
        period,
        carried_amount: parseFloat(overrideAmount),
        rollover_type: budget.rollover_type ?? 'carry-over',
      })
    }
    setOverrideSaving(false)
    setShowRolloverOverride(false)
    setOverrideAmount('')
    onGoalCreated?.() // reuse to trigger parent refresh (loadSpending)
  }

  // Ordering helpers
  const sortedSiblings = [...siblings].sort((a, b) => a.sort_order - b.sort_order)
  const currentIndex = sortedSiblings.findIndex((s) => s.id === budget.id)
  const canMoveUp = currentIndex > 0
  const canMoveDown = currentIndex < sortedSiblings.length - 1

  async function moveBudget(direction: 'up' | 'down') {
    if (reordering) return
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    const target = sortedSiblings[targetIndex]
    if (!target) return
    setReordering(true)
    const supabase = createClient()
    await Promise.all([
      supabase.from('budgets').update({ sort_order: target.sort_order }).eq('id', budget.id),
      supabase.from('budgets').update({ sort_order: budget.sort_order }).eq('id', target.id),
    ])
    setReordering(false)
    onReorder()
  }
  const { dailyExpenseRate, loading: rateLoading, source: rateSource } = useDailyExpenseRate()
  const hasFreedomData = !rateLoading && rateSource === 'transactions' && dailyExpenseRate > 0
  const budgetType = (budget.budget_type ?? 'expense') as BudgetType
  const colors = getTypeColors(budgetType)
  const children = parent && 'children' in parent ? (parent as BudgetWithChildren).children : []
  const isParent = children.length > 0 && parent?.id === budget.id

  const spent = isParent
    ? children.reduce((sum, c) => sum + getSpent(c), 0)
    : getSpent(budget)
  const limit = isParent
    ? children.reduce((sum, c) => sum + getEffectiveLimit(c), 0)
    : getEffectiveLimit(budget)
  const remaining = limit - spent
  const pct = limit > 0 ? Math.min(Math.round((spent / limit) * 100), 100) : 0
  const carry = isParent
    ? children.reduce((sum, c) => sum + getBudgetCarry(c), 0)
    : getBudgetCarry(budget)
  const cumulativeCarry = rolloverHistory.reduce((sum, r) => sum + Number(r.carried_amount), 0)

  // Filter transactions for this budget (or children if parent)
  const budgetIds = isParent ? children.map(c => c.id) : [budget.id]
  const budgetTx = transactions.filter(t => budgetIds.includes(t.budget_id))

  // 12-month spending history + limit changes (fetched on mount)
  const [history, setHistory] = useState<{ month: string; label: string; spent: number; limit: number }[]>([])
  const [limitHistory, setLimitHistory] = useState<{ date: string; amount: number }[]>([])
  // Per-child sparkline data (budgetId -> SparklineDataPoint[])
  const [childSparklines, setChildSparklines] = useState<Record<string, SparklineDataPoint[]>>({})
  useEffect(() => {
    async function loadHistory() {
      const supabase = createClient()
      const now = new Date()
      const months: { month: string; start: string; end: string; label: string }[] = []
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const start = localDateStr(d)
        const end = localDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 1))
        const label = d.toLocaleDateString('nl-NL', { month: 'short' })
        months.push({ month: start, start, end, label })
      }

      const [{ data: txData }, { data: splitTxInRange }, { data: amountData }] = await Promise.all([
        supabase
          .from('transactions')
          .select('budget_id, amount, date')
          .in('budget_id', budgetIds)
          .gte('date', months[0].start)
          .lt('date', months[months.length - 1].end),
        supabase
          .from('transactions')
          .select('id, date')
          .gte('date', months[0].start)
          .lt('date', months[months.length - 1].end)
          .eq('is_split', true),
        supabase
          .from('budget_amounts')
          .select('budget_id, effective_from, amount')
          .in('budget_id', budgetIds),
      ])

      // Fetch split amounts for these budgets within the date range
      const splitTxIds = (splitTxInRange ?? []).map(t => t.id)
      const splitDateMap: Record<string, string> = {}
      for (const t of (splitTxInRange ?? [])) splitDateMap[t.id] = t.date
      let splitRows: { budget_id: string; amount: number; date: string }[] = []
      if (splitTxIds.length > 0) {
        const { data: splitData } = await supabase
          .from('transaction_splits')
          .select('budget_id, amount, transaction_id')
          .in('budget_id', budgetIds)
          .in('transaction_id', splitTxIds)
        if (splitData) {
          splitRows = splitData
            .filter(s => s.budget_id && splitDateMap[s.transaction_id])
            .map(s => ({ budget_id: s.budget_id, amount: Number(s.amount), date: splitDateMap[s.transaction_id] }))
        }
      }

      // Build limit change timeline
      const changes = (amountData ?? [])
        .sort((a, b) => a.effective_from.localeCompare(b.effective_from))
        .map(a => ({ date: a.effective_from, amount: Number(a.amount) }))
      setLimitHistory(changes)

      const result = months.map(m => {
        const monthTx = (txData ?? []).filter(t => t.date >= m.start && t.date < m.end && budgetIds.includes(t.budget_id))
        const monthSplits = splitRows.filter(s => s.date >= m.start && s.date < m.end)
        const monthSpent = monthTx.reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
          + monthSplits.reduce((s, r) => s + Math.abs(r.amount), 0)

        // Calculate effective limit for this month
        let monthLimit = 0
        for (const bid of budgetIds) {
          const bud = isParent ? children.find(c => c.id === bid) : budget
          const applicable = (amountData ?? [])
            .filter(a => a.budget_id === bid && a.effective_from <= m.start)
            .sort((a, b) => b.effective_from.localeCompare(a.effective_from))
          monthLimit += applicable.length > 0
            ? Number(applicable[0].amount)
            : Number(bud?.default_limit ?? 0)
        }

        return { month: m.start, label: m.label, spent: monthSpent, limit: monthLimit }
      })

      setHistory(result)

      // Build per-child sparkline data
      if (isParent && children.length > 0) {
        const childData: Record<string, SparklineDataPoint[]> = {}
        for (const child of children) {
          childData[child.id] = months.map(m => {
            const monthTx = (txData ?? []).filter(t => t.date >= m.start && t.date < m.end && t.budget_id === child.id)
            const monthChildSplits = splitRows.filter(s => s.date >= m.start && s.date < m.end && s.budget_id === child.id)
            const monthSpent = monthTx.reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
              + monthChildSplits.reduce((s, r) => s + Math.abs(r.amount), 0)
            return { month: m.month, label: m.label, spent: monthSpent }
          })
        }
        setChildSparklines(childData)
      }
    }

    loadHistory()
  }, [budget.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const maxHistoryValue = Math.max(...history.map(h => Math.max(h.spent, h.limit)), 1)
  const budgetGroups = allBudgets.map(b => ({ parent: b as Budget, children: (b as BudgetWithChildren).children ?? [] }))

  return (
    <>
    {/* Pane (lg+) / full-height sheet (<lg) — plan §5.1.
        Geen `onBack` op deze view: dit is de root van de pane-flow. De `onBack`-
        prop wordt straks in een vervolgtaak (§6.1) gebruikt voor transactie-
        detail-binnen-pane. Voor edit-toggle gaan we naar `?…&edit=true` en
        rendert de parent een tweede ShellOverlay (BudgetEditModal). */}
    <ShellOverlay open={true} onClose={onClose} kind="pane" title={budget.name}>
        {/* Header accent */}
        <div className={`flex items-center gap-3 bg-gradient-to-r ${colors.headerGradient} px-6 py-4`}>
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${colors.bgDark}`}>
            <BudgetIcon name={budget.icon} className={`h-5 w-5 ${colors.text}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {perspective === 'household' && budget.ownership === 'shared' && (
                <OwnershipBadge ownership="shared" />
              )}
            </div>
            {budget.description && <p className="truncate text-xs text-[var(--ink-3)]">{budget.description}</p>}
          </div>
        </div>

        {/* Spending summary — donut ring */}
        <DetailModalDonut
          spent={spent}
          limit={limit}
          remaining={remaining}
          pct={pct}
          budgetType={budgetType}
          colors={colors}
          hasFreedomData={hasFreedomData}
          dailyExpenseRate={dailyExpenseRate}
        />

        <div className="px-6 pb-4">
          {/* Per-partner breakdown for shared budgets */}
          {budgetPartnerSplit && hasFreedomData && spent >= 100 && (
            <div className="mt-3 rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] p-3" data-testid="budget-partner-breakdown">
              <div className="flex items-center gap-1.5 mb-2">
                <Users className="h-3.5 w-3.5 text-kern-500" />
                <p className="text-xs font-semibold text-[var(--ink-2)]">Impact per partner</p>
                <span className="ml-auto text-[10px] text-[var(--ink-4)]">{SPLIT_MODE_LABELS[budgetPartnerSplit.splitMode]}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div>
                  <p className="text-[10px] font-medium text-[var(--ink-3)] uppercase truncate">{budgetPartnerSplit.myName}</p>
                  <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                    {<MaskedAmount value={spent * budgetPartnerSplit.mySharePct / 100} tone="wil" />}
                  </p>
                  <p className="text-xs italic text-[var(--ink-3)]">
                    ≈ {eurToFreedomTime(spent * budgetPartnerSplit.mySharePct / 100, dailyExpenseRate).formattedDagen}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-[var(--ink-3)] uppercase truncate">{budgetPartnerSplit.partnerName}</p>
                  <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                    {<MaskedAmount value={spent * (100 - budgetPartnerSplit.mySharePct) / 100} tone="wil" />}
                  </p>
                  <p className="text-xs italic text-[var(--ink-3)]">
                    ≈ {eurToFreedomTime(spent * (100 - budgetPartnerSplit.mySharePct) / 100, dailyExpenseRate).formattedDagen}
                  </p>
                </div>
              </div>
            </div>
          )}

          {carry > 0 && (
            <div className={`mt-2 flex items-center gap-1.5 rounded border px-2 py-1.5 ${colors.bg} ${colors.border}`}>
              <span className={`text-xs font-medium ${colors.text}`}>Doorgeschoven:</span>
              <span className={`font-mono text-xs font-semibold ${colors.text}`}>+{<MaskedAmount value={carry} tone="wil" />}</span>
            </div>
          )}

          {rolloverHistory.length > 1 && (
            <div className="mt-3 border-t border-[var(--border-ed)] pt-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--ink-3)]">Overgedragen saldo</p>
                <button
                  type="button"
                  onClick={() => {
                    setOverrideAmount(String(carry || 0))
                    setShowRolloverOverride(v => !v)
                  }}
                  className="text-[10px] font-medium text-[var(--ink-4)] hover:text-kern-600"
                >
                  {showRolloverOverride ? 'Annuleren' : 'Override →'}
                </button>
              </div>
              {showRolloverOverride && (
                <div className="mb-3 flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-3)]">€</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={overrideAmount}
                      onChange={e => setOverrideAmount(e.target.value)}
                      className="w-full rounded-[var(--r-sm)] border border-[var(--border-md)] py-1.5 pl-6 pr-2 text-right font-mono text-sm text-[var(--ink)] outline-none focus:border-kern-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleRolloverOverride}
                    disabled={overrideSaving}
                    className="rounded-[var(--r-sm)] bg-kern-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-kern-700 disabled:opacity-50"
                  >
                    {overrideSaving ? '...' : 'Instellen'}
                  </button>
                </div>
              )}
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {rolloverHistory.slice(0, 6).map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-xs">
                    <span className="text-[var(--ink-3)]">{r.period}</span>
                    <span className={`font-mono font-medium ${Number(r.carried_amount) > 0 ? colors.text : 'text-[var(--ink-4)]'}`}>
                      {Number(r.carried_amount) > 0 ? '+' : ''}{<MaskedAmount value={Number(r.carried_amount)} tone="wil" />}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Doeltype — 4a: Vaste Maandlast */}
          {budget.goal_type === 'vaste_maandlast' && (
            <div className={`mt-2 flex items-center gap-2 rounded border px-2 py-1.5 ${spent <= limit ? 'bg-emerald-50 border-emerald-200' : 'bg-kern-50 border-kern-200'}`}>
              {spent <= limit
                ? <><CheckCircle2 className="h-4 w-4 text-emerald-600" /><span className="text-xs font-medium text-emerald-700">Gedekt</span></>
                : <><AlertTriangle className="h-4 w-4 text-kern-600" /><span className="text-xs font-medium text-kern-700">Tekort: {<MaskedAmount value={spent - limit} tone="wil" />}</span></>
              }
            </div>
          )}

          {/* Doeltype — 4b: Bestedingslimiet */}
          {budget.goal_type === 'bestedingslimiet' && pct >= 80 && (
            <p className="mt-1 text-xs font-medium text-kern-700">
              {pct >= 100 ? '⚠️ Limiet overschreden' : `⚠️ ${100 - pct}% resterend`}
            </p>
          )}

          {/* Doeltype — 4d: Maandelijkse Reservering */}
          {budget.goal_type === 'maandelijkse_reservering' && (
            <div className="mt-2 rounded border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2">
              <p className="text-[10px] text-[var(--ink-3)] uppercase tracking-[.08em]">Opgebouwd saldo</p>
              <p className="font-mono text-base font-semibold text-[var(--ink)]">{<MaskedAmount value={cumulativeCarry} tone="wil" />}</p>
              <p className="text-[10px] text-[var(--ink-3)] mt-0.5">Rollover staat automatisch aan</p>
            </div>
          )}
        </div>

        {/* Doeltype — 4c: Spaardoel (budget-native) — hidden when a De Wil goal is linked */}
        {budget.goal_type === 'spaardoel' && budget.goal_amount && goals.length === 0 && (() => {
          const maandenResterend = budget.goal_date
            ? Math.max(1, (new Date(budget.goal_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30))
            : null
          const benodigdPerMaand = maandenResterend
            ? Math.max(0, (budget.goal_amount - cumulativeCarry) / maandenResterend)
            : null
          const spaarProgress = Math.min(100, (cumulativeCarry / budget.goal_amount) * 100)
          const opSchema = benodigdPerMaand !== null && spent >= benodigdPerMaand
          return (
            <div className="border-t border-[var(--border-ed)] px-6 py-4" data-testid="budget-native-spaardoel">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--ink-3)]">Spaardoel</p>
                {budget.goal_date && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium uppercase ${opSchema ? `${colors.bg} ${colors.text} ${colors.border}` : 'bg-kern-50 text-kern-700 border-kern-200'}`}>
                    {opSchema ? 'Op schema' : 'Achter op schema'}
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="font-mono text-base font-semibold">{<MaskedAmount value={cumulativeCarry} tone="wil" />}</span>
                <span className="font-mono text-xs text-[var(--ink-3)]">van {<MaskedAmount value={budget.goal_amount} tone="wil" />}</span>
              </div>
              {benodigdPerMaand !== null && (
                <p className="text-xs text-[var(--ink-3)] mb-2">Benodigd: <span className="font-mono font-medium">{<MaskedAmount value={benodigdPerMaand} tone="wil" />}/mnd</span></p>
              )}
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
                <div className="h-full rounded-full" style={{ width: `${spaarProgress}%`, backgroundColor: colors.barHex }} />
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-[var(--ink-3)]">
                <span>{Math.round(spaarProgress)}% bereikt</span>
                {budget.goal_date && <span>{new Date(budget.goal_date).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}</span>}
              </div>
            </div>
          )
        })()}

        {/* Doeltype — 4e: Periodieke Last (Sinking Fund) */}
        {budget.goal_type === 'periodieke_last' && budget.goal_amount && (() => {
          const maandenMap: Record<string, number> = { jaarlijks: 12, halfjaarlijks: 6, kwartaal: 3 }
          const maanden = maandenMap[budget.goal_frequency ?? ''] ?? 12
          const maandelijksBedrag = budget.goal_amount / maanden
          const sinkProgress = Math.min(100, (cumulativeCarry / budget.goal_amount) * 100)
          return (
            <div className="border-t border-[var(--border-ed)] px-6 py-4" data-testid="budget-periodieke-last">
              <p className="text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--ink-3)] mb-2">Periodieke Last</p>
              <div className="flex justify-between text-xs mb-2">
                <span className="text-[var(--ink-3)]">Maandelijks reserveren</span>
                <span className="font-mono font-semibold">{<MaskedAmount value={maandelijksBedrag} tone="wil" />}</span>
              </div>
              <div className="flex justify-between text-xs mb-2">
                <span className="text-[var(--ink-3)]">Opgebouwd saldo</span>
                <span className="font-mono font-semibold">{<MaskedAmount value={cumulativeCarry} tone="wil" />}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
                <div className="h-full rounded-full" style={{ width: `${sinkProgress}%`, backgroundColor: colors.barHex }} />
              </div>
              <p className="text-[10px] text-[var(--ink-3)] mt-1">Reset na uitgave · Doel: {<MaskedAmount value={budget.goal_amount} tone="wil" />}</p>
            </div>
          )
        })()}

        {/* Spaardoel section — only for savings budgets or when a goal is linked */}
        {(budget.budget_type === 'savings' || goals.length > 0) && (() => {
          const linkedGoal = goals[0] ?? null

          if (!linkedGoal) {
            // Show option to create/link a goal for savings budgets
            if (budget.budget_type !== 'savings') return null
            return (
              <div className="border-t border-[var(--border-ed)] px-6 py-4" data-testid="budget-savings-goal-empty">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--ink-3)]">Spaardoel</p>
                {!showCreateGoalForm ? (
                  <>
                    <p className="text-xs italic text-[var(--ink-3)] mb-3">
                      Koppel een spaardoel aan dit budget om voortgang bij te houden.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowCreateGoalForm(true)}
                        className="inline-flex items-center gap-1.5 rounded border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
                      >
                        <Plus className="h-3 w-3" />
                        Spaardoel aanmaken
                      </button>
                      <a
                        href="/will"
                        className="text-xs italic text-[var(--ink-3)] hover:text-[var(--ink-2)]"
                      >
                        Bekijk doelen →
                      </a>
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    {goalError && (
                      <p className="text-xs text-red-600">{goalError}</p>
                    )}
                    <div>
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-[.06em] text-[var(--ink-3)]">Naam</label>
                      <input
                        type="text"
                        value={goalForm.name}
                        onChange={e => setGoalForm(p => ({ ...p, name: e.target.value }))}
                        placeholder="bijv. Noodfonds"
                        className="w-full rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-[10px] font-medium uppercase tracking-[.06em] text-[var(--ink-3)]">Doelbedrag (€)</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={goalForm.target_value}
                          onChange={e => setGoalForm(p => ({ ...p, target_value: e.target.value }))}
                          placeholder="0"
                          className="w-full rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 text-sm font-mono text-[var(--ink)] outline-none focus:border-kern-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-medium uppercase tracking-[.06em] text-[var(--ink-3)]">Doeldatum (opt.)</label>
                        <input
                          type="date"
                          value={goalForm.target_date}
                          onChange={e => setGoalForm(p => ({ ...p, target_date: e.target.value }))}
                          className="w-full rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleCreateGoal}
                        disabled={goalSaving}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-[var(--r)] bg-kern-600 px-3 py-2 text-xs font-medium text-white hover:bg-kern-700 disabled:opacity-50"
                      >
                        <Save className="h-3 w-3" />
                        {goalSaving ? 'Opslaan...' : 'Aanmaken'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowCreateGoalForm(false); setGoalError('') }}
                        className="rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-xs font-medium text-[var(--ink-3)] hover:bg-[var(--subtle)]"
                      >
                        Annuleren
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          }

          const progress = linkedGoal.target_value > 0
            ? Math.min(100, (cumulativeCarry / linkedGoal.target_value) * 100)
            : 0
          const goalRemaining = linkedGoal.target_value - cumulativeCarry
          const isOnTrack = linkedGoal.target_date
            ? (() => {
                const monthsLeft = Math.max(1, (new Date(linkedGoal.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30))
                const neededPerMonth = goalRemaining / monthsLeft
                const avgMonthlySaving = rolloverHistory.length > 0
                  ? cumulativeCarry / rolloverHistory.length
                  : spent
                return avgMonthlySaving >= neededPerMonth
              })()
            : null

          return (
            <div className="border-t border-[var(--border-ed)] px-6 py-4" data-testid="budget-savings-goal">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--ink-3)]">Spaardoel</p>
                {linkedGoal.target_date && (
                  <span className={`text-[10px] font-medium uppercase tracking-[.06em] px-2 py-0.5 rounded-full border ${
                    isOnTrack
                      ? `${colors.bg} ${colors.text} ${colors.border}`
                      : 'bg-[#fff0ef] text-[#b33a2e] border-[#f5c5c0]'
                  }`}>
                    {isOnTrack ? 'Op schema' : 'Achter op schema'}
                  </span>
                )}
              </div>
              <p className="font-medium text-sm text-[var(--ink)] mb-1">{linkedGoal.name}</p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="font-mono text-base font-semibold text-[var(--ink)]">{<MaskedAmount value={cumulativeCarry} tone="wil" />}</span>
                <span className="font-mono text-xs text-[var(--ink-3)]">van {<MaskedAmount value={linkedGoal.target_value} tone="wil" />}</span>
              </div>
              {hasFreedomData && cumulativeCarry >= 100 && (
                <p className="text-xs italic text-[var(--ink-3)] mb-2">
                  {eurToFreedomTime(cumulativeCarry, dailyExpenseRate).formattedDagen} vrijheid opgebouwd
                </p>
              )}
              {/* Progress bar */}
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${progress}%`, backgroundColor: colors.barHex }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-[var(--ink-3)]">
                <span>{Math.round(progress)}% bereikt</span>
                <span>
                  {goalRemaining > 0 && <><span className="font-mono">{<MaskedAmount value={goalRemaining} tone="wil" />}</span> resterend</>}
                  {linkedGoal.target_date && (
                    <> · {new Date(linkedGoal.target_date).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}</>
                  )}
                </span>
              </div>
            </div>
          )
        })()}

        {/* Children list */}
        {isParent && children.length > 0 && (
          <div className="border-t border-[var(--border-ed)] px-6 py-4">
            <p className="mb-2 text-xs font-semibold text-[var(--ink-3)] uppercase">Subbudgetten</p>
            <div className="space-y-1.5">
              {children.map((child) => {
                const childSpent = getSpent(child)
                const childLimit = getEffectiveLimit(child)
                const childPct = childLimit > 0 ? Math.min(Math.round((childSpent / childLimit) * 100), 100) : 0
                const childSparkData = childSparklines[child.id]
                return (
                  <div
                    key={child.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-ed)] p-2 transition-colors ${colors.hoverBg}`}
                    onClick={() => onSelectChild(child.id)}
                  >
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${colors.bg}`}>
                      <BudgetIcon name={child.icon} className={`h-3.5 w-3.5 ${colors.textLight}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="truncate text-xs font-medium text-[var(--ink-2)]">{child.name}</p>
                        <div className="ml-2 flex shrink-0 items-center gap-2">
                          {/* Per-child sparkline */}
                          {childSparkData && childSparkData.length >= 2 && (
                            <BudgetSparkline
                              data={childSparkData}
                              width={60}
                              height={20}
                              isIncome={budgetType === 'income'}
                              showFill={true}
                              testId={`child-sparkline-${child.id}`}
                            />
                          )}
                          <div className="text-right">
                            <span className="text-xs text-[var(--ink-3)]">
                              {<MaskedAmount value={childSpent} tone="wil" />} / {<MaskedAmount value={childLimit} tone="wil" />}
                            </span>
                            {hasFreedomData && childLimit - childSpent >= 100 && (
                              <p className="text-sm italic text-[var(--ink-3)]" data-testid="child-freedom-remaining">
                                nog {eurToFreedomTime(childLimit - childSpent, dailyExpenseRate).formattedDagen}
                              </p>
                            )}
                            {hasFreedomData && childSpent > childLimit && childSpent - childLimit >= 100 && (
                              <p className="text-sm italic text-[var(--ink-3)]" data-testid="child-freedom-over">
                                <span className={isOverPositive(budgetType) ? 'text-positive' : 'text-negative'}>
                                  {isOverPositive(budgetType)
                                    ? `+${eurToFreedomTime(childSpent - childLimit, dailyExpenseRate).formattedDagen}`
                                    : `${eurToFreedomTime(childSpent - childLimit, dailyExpenseRate).formattedDagen} ingeleverd`}
                                </span>
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      {(() => {
                        const childSeg = computeBarSegments(childSpent, childLimit, child.alert_threshold ?? 80, colors, isOverPositive(budgetType))
                        return (
                          <div className="relative mt-1 h-1 w-full overflow-hidden rounded-full bg-zinc-100">
                            {/* Fill 1 — normaal */}
                            <div
                              className="absolute inset-y-0 left-0 rounded-l-full"
                              style={{ width: `${childSeg.normalPct}%`, backgroundColor: childSeg.normalColor }}
                            />
                            {/* Fill 2 — waarschuwing */}
                            {childSeg.warnPct > 0 && (
                              <div
                                className="absolute inset-y-0 rounded-r-full"
                                style={{ left: `${childSeg.warnLeft}%`, width: `${childSeg.warnPct}%`, backgroundColor: childSeg.warnColor }}
                              />
                            )}
                            {/* Extension */}
                            {childSeg.extensionPct > 0 && (
                              <div
                                className="absolute inset-y-0 rounded-r-full"
                                style={{ left: `${childSeg.extensionLeft}%`, width: `${childSeg.extensionPct}%`, backgroundColor: childSeg.extensionColor, opacity: 0.7 }}
                              />
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Transactions this month */}
        {budgetTx.length > 0 && (
          <div className="border-t border-[var(--border-ed)] px-6 py-4">
            <p className="mb-2 text-xs font-semibold text-[var(--ink-3)] uppercase">
              Transacties deze maand ({budgetTx.length})
            </p>
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {budgetTx.map((tx, i) => {
                const isSplitRow = tx.is_split_row === true
                const isExpense = budgetType !== 'income'
                const amountColor = isSplitRow
                  ? (isExpense ? 'text-negative' : 'text-positive')
                  : (Number(tx.amount) < 0 ? 'text-negative' : 'text-positive')
                const canOpen = !!(tx.id && tx.account_id)
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!canOpen}
                    onClick={() => canOpen && openTransaction(tx.id!)}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--subtle)] disabled:cursor-default"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-xs font-medium text-[var(--ink-2)]">
                          {tx.counterparty_name || tx.description}
                        </p>
                        {isSplitRow && (
                          <GitFork className="h-3 w-3 shrink-0 text-[var(--ink-4)]" aria-label="Verdeeld" />
                        )}
                      </div>
                      <p className="text-[10px] text-[var(--ink-3)]">
                        {new Date(tx.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                        {tx.counterparty_name && tx.description !== tx.counterparty_name && (
                          <span className="ml-1">{tx.description}</span>
                        )}
                      </p>
                    </div>
                    <div className="ml-3 shrink-0 text-right">
                      <span className={`text-xs font-medium ${amountColor}`}>
                        {<MaskedAmount value={Math.abs(Number(tx.amount))} tone="wil" />}
                      </span>
                      {hasFreedomData && Math.abs(Number(tx.amount)) >= 100 && (
                        <p className="text-sm italic text-[var(--ink-3)]" data-testid="tx-freedom-time">
                          {eurToFreedomTime(Math.abs(Number(tx.amount)), dailyExpenseRate).formattedDagen}
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Bestedingshistorie — sparkline + 12-maanden barchart */}
        {history.length > 0 && (
          <div className="border-t border-[var(--border-ed)] px-6 py-4" data-testid="budget-sparkline-section">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-[var(--ink-3)] uppercase">Bestedingshistorie</p>
              {history.length >= 2 && (
                <SparklineWithLabel
                  data={history.map(h => ({ month: h.month, label: h.label, spent: h.spent }))}
                  width={100}
                  height={28}
                  isIncome={budgetType === 'income'}
                  testId="budget-detail-sparkline"
                />
              )}
            </div>
            <div className="flex items-end gap-1" style={{ height: 80 }}>
              {history.map((h, i) => {
                const spentH = (h.spent / maxHistoryValue) * 100
                const limitH = (h.limit / maxHistoryValue) * 100
                const over = h.spent > h.limit && h.limit > 0
                const isSelected = selectedHistMonth === h.month
                const isCurrentMonth = i === history.length - 1
                const barColor = over ? '#f87171' : colors.barHex
                return (
                  <button
                    key={h.month}
                    type="button"
                    onClick={() => selectHistMonth(h.month)}
                    className="group relative flex flex-1 flex-col items-center focus-visible:outline-none"
                    style={{ height: '100%' }}
                    title={`${h.label}: ${formatMaskedCurrency(h.spent, masked)}${isCurrentMonth ? ' (lopende maand)' : ''}`}
                  >
                    {/* Limit indicator line */}
                    {h.limit > 0 && (
                      <div
                        className="absolute w-full border-t border-dashed border-[var(--border-md)]"
                        style={{ bottom: `${limitH}%` }}
                      />
                    )}
                    {/* Spent bar */}
                    <div className="mt-auto w-full">
                      <div
                        className="w-full rounded-t transition-opacity"
                        style={{
                          height: `${Math.max(spentH * 0.8, 2)}px`,
                          backgroundColor: barColor,
                          opacity: selectedHistMonth && !isSelected ? 0.35 : isCurrentMonth ? 0.5 : 1,
                          outline: isSelected ? `2px solid ${colors.barHex}` : undefined,
                          outlineOffset: isSelected ? '2px' : undefined,
                          ...(isCurrentMonth ? { borderTop: `2px dashed ${barColor}` } : {}),
                        }}
                      />
                    </div>
                    {/* Month label */}
                    <p className={`mt-1 text-[9px] transition-colors ${isSelected ? 'font-semibold text-[var(--ink-2)]' : isCurrentMonth ? 'italic text-[var(--ink-3)]' : 'text-[var(--ink-3)]'}`}>{h.label}{isCurrentMonth ? '*' : ''}</p>
                    {/* Tooltip */}
                    <div className="pointer-events-none absolute -top-10 z-10 rounded bg-zinc-800 px-2 py-1 text-[10px] text-white opacity-0 shadow-[var(--s2)] transition-opacity group-hover:opacity-100">
                      {<MaskedAmount value={h.spent} tone="wil" />} / {<MaskedAmount value={h.limit} tone="wil" />}{isCurrentMonth ? ' ∗' : ''}
                    </div>
                  </button>
                )
              })}
            </div>
            <p className="mt-1 text-right text-[8px] italic text-[var(--ink-4)]">* lopende maand</p>

            {/* Uitklappanel voor geselecteerde maand */}
            {selectedHistMonth && (() => {
              const hEntry = history.find(h => h.month === selectedHistMonth)
              if (!hEntry) return null
              return (
                <div style={{ animation: 'fadeUp 0.2s ease-out both' }} className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold text-[var(--ink-2)]">
                      {new Date(selectedHistMonth).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}
                    </p>
                    <div className="flex items-center gap-3 text-[10px] text-[var(--ink-3)]">
                      <span>{<MaskedAmount value={hEntry.spent} tone="wil" />} besteed</span>
                      {hEntry.limit > 0 && <span>/ {<MaskedAmount value={hEntry.limit} tone="wil" />} limiet</span>}
                      {hEntry.limit > 0 && (
                        <span className={hEntry.spent > hEntry.limit
                          ? (isOverPositive(budgetType) ? 'font-semibold text-positive' : 'font-semibold text-negative')
                          : 'text-positive'}>
                          {hEntry.spent > hEntry.limit ? '+' : '-'}{<MaskedAmount value={Math.abs(hEntry.spent - hEntry.limit)} tone="wil" />}
                        </span>
                      )}
                    </div>
                  </div>
                  {histMonthTxLoading ? (
                    <p className="text-[11px] italic text-[var(--ink-4)]">Laden…</p>
                  ) : histMonthTx.length === 0 ? (
                    <p className="text-[11px] italic text-[var(--ink-4)]">Geen transacties gevonden.</p>
                  ) : (
                    <div className="max-h-48 space-y-0.5 overflow-y-auto">
                      {histMonthTx.map((tx) => (
                        <button
                          key={tx.id}
                          type="button"
                          onClick={() => openTransaction(tx.id)}
                          className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--subtle)]"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-[var(--ink-2)]">
                              {tx.counterparty_name || tx.description}
                            </p>
                            <p className="text-[10px] text-[var(--ink-3)]">
                              {new Date(tx.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                              {tx.counterparty_name && tx.description !== tx.counterparty_name && (
                                <span className="ml-1">{tx.description}</span>
                              )}
                            </p>
                          </div>
                          <span className={`ml-3 shrink-0 text-xs font-medium tabular-nums ${Number(tx.amount) < 0 ? 'text-negative' : 'text-positive'}`}>
                            {<MaskedAmount value={Math.abs(Number(tx.amount))} tone="wil" />}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )}

        {/* Budget forecast next month prediction with spending variance confidence */}
        {(() => {
          // Exclude current (incomplete) month from forecast and variance calculations
          const monthlySpending = history.slice(0, -1).map(h => h.spent)
          if (monthlySpending.length < 3) return null
          const forecast = computeBudgetForecast(monthlySpending, limit, budget.name)
          const varianceData = calculateSpendingVariance(monthlySpending, budget.name)

          if (!forecast.hasSufficientData) {
            return (
              <div className="border-t border-[var(--border-ed)] px-6 py-4" data-testid="budget-forecast-section">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-[var(--ink-3)]" />
                  <p className="text-xs font-semibold text-[var(--ink-3)] uppercase">Voorspelling volgende maand</p>
                </div>
                <p className="text-xs text-[var(--ink-3)] italic" data-testid="budget-forecast-insufficient">
                  {forecast.message}
                </p>
                {/* Variance detail for insufficient data */}
                <SpendingVarianceDetailPanel data={varianceData} className="mt-2" />
              </div>
            )
          }

          const confColors = getConfidenceColors(forecast.confidence)
          const confLabel = getConfidenceLabel(forecast.confidence)

          return (
            <>
            <div className="border-t border-[var(--border-ed)] px-6 py-4" data-testid="budget-forecast-section">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-[var(--ink-3)]" />
                <p className="text-xs font-semibold text-[var(--ink-3)] uppercase">Voorspelling volgende maand</p>
              </div>

              {/* Compact forecast card — collapsed: bedrag + badge, expanded: alle details */}
              <div className="rounded-[var(--r-lg)] border border-[var(--border-md)] bg-[var(--subtle)]/50" data-testid="budget-forecast-card">
                {/* Collapsed row — altijd zichtbaar */}
                <button
                  type="button"
                  onClick={() => setShowForecastExpanded(v => !v)}
                  className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-[var(--subtle)]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kern-300 rounded-[var(--r-lg)]"
                  aria-expanded={showForecastExpanded}
                  aria-label="Voorspellingsdetails tonen"
                >
                  <div>
                    <p className="text-xs text-[var(--ink-3)] font-medium">Verwachte uitgaven</p>
                    <p className="text-lg font-bold text-[var(--ink)] mt-0.5" data-testid="budget-forecast-amount">
                      {<MaskedAmount value={forecast.predicted} tone="wil" />}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <SpendingConfidenceBadge data={varianceData} />
                    {showForecastExpanded
                      ? <ChevronUp className="h-3.5 w-3.5 text-[var(--ink-3)]" />
                      : <ChevronDown className="h-3.5 w-3.5 text-[var(--ink-3)]" />
                    }
                  </div>
                </button>

                {/* Expanded details — uitklapbaar */}
                {showForecastExpanded && (
                  <div className="border-t border-dashed border-[var(--border-ed)] px-4 pb-4" style={{ animation: 'fadeUp 0.25s ease-out both' }}>
                    {/* Freedom time equivalent */}
                    {hasFreedomData && forecast.predicted >= 100 && (
                      <p className="font-serif text-sm italic text-[var(--ink-3)] mt-3">
                        ≈ {eurToFreedomTime(forecast.predicted, dailyExpenseRate).formattedDagen}
                      </p>
                    )}

                    {/* Contextual message */}
                    <p className="text-xs text-[var(--ink-3)] mt-3" data-testid="budget-forecast-message">
                      {forecast.message}
                    </p>

                    {/* Confidence detail */}
                    <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--ink-3)]">
                      <span>Gebaseerd op {forecast.monthsUsed} maanden</span>
                      <span>•</span>
                      <span>{forecast.confidencePercent}% betrouwbaarheid</span>
                    </div>

                    {/* Budget limit comparison bar */}
                    {limit > 0 && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-[10px] text-[var(--ink-3)] mb-1">
                          <span>Voorspeld vs limiet</span>
                          <span>{Math.round((forecast.predicted / limit) * 100)}%</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                          <div
                            className={`h-full rounded-full transition-all ${
                              forecast.exceedsLimit
                                ? (isOverPositive(budgetType) ? 'bg-positive' : 'bg-negative')
                                : forecast.predicted / limit > 0.8 ? 'bg-kern-400' : 'bg-[var(--border-md)]'
                            }`}
                            style={{ width: `${Math.min((forecast.predicted / limit) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Spending variance detail panel */}
                    <SpendingVarianceDetailPanel data={varianceData} className="mt-3" />

                    {/* Hoe berekend link */}
                    <button
                      type="button"
                      onClick={() => setShowForecastModal(true)}
                      className="mt-3 text-[10px] text-kern-500 transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kern-300 rounded"
                    >
                      Hoe berekend? →
                    </button>
                  </div>
                )}
              </div>

              {/* Alert when predicted exceeds limit — altijd zichtbaar */}
              {forecast.exceedsLimit && forecast.alertMessage && !isOverPositive(budgetType) && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3" data-testid="budget-forecast-alert">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-red-700" data-testid="budget-forecast-alert-message">
                      {forecast.alertMessage}
                    </p>
                    <p className="text-[10px] text-red-500 mt-0.5">
                      Limiet: {<MaskedAmount value={limit} tone="wil" />} — Verwacht: {<MaskedAmount value={forecast.predicted} tone="wil" />}
                    </p>
                  </div>
                </div>
              )}
            </div>
            {/* Forecast-overlay: inspectie-overlay binnen de budget-detail-pane.
                Conform plan §5.2 (sheet voor "vergelijking/inspectie naast onder-
                liggende content") — gerouteerd via ShellOverlay zodat de
                driewegregel consistent blijft (geen bare BottomSheet binnen pane). */}
            <ShellOverlay
              open={showForecastModal}
              onClose={() => setShowForecastModal(false)}
              kind="sheet"
              size="md"
              title="Verwachte uitgaven"
            >
              <div className="p-4 sm:p-6">
              <KassabonShell>
                {/* Header */}
                <div className="mb-3 text-center">
                  <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">VOORSPELLING VOLGENDE MAAND</p>
                  <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">{budget.name} — gewogen voortschrijdend gemiddelde</p>
                </div>
                {/* Uitleg */}
                <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
                  Berekend op basis van je laatste {forecast.monthsUsed} maanden. Recentere maanden tellen zwaarder mee in de voorspelling.
                </div>
                {/* Maandwaarden */}
                <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
                  {forecast.monthlyValues.map((val, i) => {
                    const d = new Date(monthDate)
                    d.setMonth(d.getMonth() - (forecast.monthlyValues.length - 1 - i))
                    const label = d.toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' })
                    const isZero = val === 0
                    return (
                      <div key={i} className={`flex justify-between py-0.5 ${isZero ? 'opacity-40' : ''}`}>
                        <span className="font-sans text-sm text-[var(--ink-2)]">{label}{isZero ? ' (geen data)' : ` × ${i + 1}`}</span>
                        <span className="text-[var(--ink)]">{isZero ? '—' : <MaskedAmount value={val} tone="wil" />}</span>
                      </div>
                    )
                  })}
                </div>
                {/* Statistieken */}
                <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2">
                  <div className="flex justify-between py-0.5">
                    <span className="font-sans text-sm text-[var(--ink-3)]">Gemiddelde (enkelvoudig)</span>
                    <span className="tabular-nums text-[var(--ink-3)]">{<MaskedAmount value={forecast.mean} tone="wil" />}</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="font-sans text-sm text-[var(--ink-3)]">Standaardafwijking</span>
                    <span className="tabular-nums text-[var(--ink-3)]">± {<MaskedAmount value={forecast.stdDev} tone="wil" />}</span>
                  </div>
                </div>
                {/* Totaalregel */}
                <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
                  <span className="text-[var(--ink)]">Verwacht volgende maand</span>
                  <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={forecast.predicted} tone="wil" />}</span>
                </div>
                {/* Freedom badge */}
                {hasFreedomData && forecast.predicted >= 100 && (
                  <div className="mt-3 rounded-[var(--r)] border border-[var(--hor-m)] bg-[var(--hor-l)] px-3 py-2 text-center">
                    <p className="font-playfair text-xl font-bold text-[var(--hor-t)]">
                      {eurToFreedomTime(forecast.predicted, dailyExpenseRate).formattedDagen}
                    </p>
                    <p className="font-sans text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">VRIJHEIDSTIJD</p>
                  </div>
                )}
                {/* Limiet vergelijking */}
                {limit > 0 && (
                  <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2">
                    <div className="flex justify-between py-0.5 font-sans text-[11px]">
                      <span className="text-[var(--ink-3)]">Budgetlimiet</span>
                      <span className="tabular-nums text-[var(--ink-3)]">{<MaskedAmount value={limit} tone="wil" />}</span>
                    </div>
                    <div className={`flex justify-between py-0.5 font-sans text-[11px] font-medium ${
                      forecast.exceedsLimit
                        ? (isOverPositive(budgetType) ? 'text-positive' : 'text-negative')
                        : 'text-positive'
                    }`}>
                      <span>{forecast.exceedsLimit ? (isOverPositive(budgetType) ? 'Verwacht boven doel' : 'Verwachte overschrijding') : 'Verwachte ruimte'}</span>
                      <span className="tabular-nums">{forecast.exceedsLimit ? '+' : ''}{<MaskedAmount value={Math.abs(forecast.predicted - limit)} tone="wil" />}</span>
                    </div>
                  </div>
                )}
                {/* Formule */}
                <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
                  <p><strong className="font-semibold text-[var(--ink-3)]">Formule:</strong> gewogen gemiddelde — maand 1 × 1, … maand {forecast.monthsUsed} × {forecast.monthsUsed}, gedeeld door de som der gewichten</p>
                </div>
                {/* Betrouwbaarheid */}
                <div className="mt-2 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] text-[var(--ink-3)]">
                  <p>Betrouwbaarheid: <strong className="text-[var(--ink-2)]">{getConfidenceLabel(forecast.confidence)}</strong> ({forecast.confidencePercent}%)</p>
                </div>
                {/* Footer */}
                <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">Gebaseerd op {forecast.monthsUsed} maanden transactiedata</p>
              </KassabonShell>
              </div>
            </ShellOverlay>
            </>
          )
        })()}

        {/* Limit change history */}
        {limitHistory.length > 1 && (
          <div className="border-t border-[var(--border-ed)] px-6 py-4">
            <p className="mb-2 text-xs font-semibold text-[var(--ink-3)] uppercase">Limiet wijzigingen</p>
            <div className="space-y-1.5">
              {limitHistory.map((change, i) => {
                const prev = i > 0 ? limitHistory[i - 1].amount : null
                const delta = prev != null ? change.amount - prev : null
                return (
                  <div key={i} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-[var(--subtle)]">
                    <span className="text-xs text-[var(--ink-3)]">
                      {new Date(change.date).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-[var(--ink-2)]">{<MaskedAmount value={change.amount} tone="wil" />}</span>
                      {delta != null && delta !== 0 && (
                        <span className={`text-[10px] font-medium ${delta > 0 ? 'text-positive' : 'text-negative'}`}>
                          {delta > 0 ? '+' : ''}{<MaskedAmount value={delta} tone="wil" />}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Delete confirmation */}
        {showDeleteConfirm && (
          <div className="border-t border-orange-200 bg-orange-50 px-6 py-4" data-testid="budget-delete-confirm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-orange-800">Budget archiveren?</p>
                <p className="mt-1 text-xs text-orange-700">
                  {isParent
                    ? `Dit archiveert "${budget.name}" en alle ${children.length} subbudgetten. Budgetten met gekoppelde transacties kunnen niet worden gearchiveerd.`
                    : `Dit archiveert "${budget.name}". Budgetten met gekoppelde transacties kunnen niet worden gearchiveerd.`
                  }
                </p>
                {deleteError && (
                  <p className="mt-1 text-xs font-medium text-red-600">{deleteError}</p>
                )}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={async () => {
                      setDeleting(true)
                      setDeleteError(null)
                      try {
                        const res = await fetch(`/api/budgets/${budget.id}`, { method: 'DELETE' })
                        if (!res.ok) {
                          const data = await res.json()
                          setDeleteError(data.error || 'Archiveren mislukt')
                          setDeleting(false)
                          return
                        }
                        onDelete()
                      } catch {
                        setDeleteError('Netwerk fout bij archiveren')
                        setDeleting(false)
                      }
                    }}
                    className="rounded-md bg-orange-600 px-3 py-1 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                    data-testid="budget-delete-confirm-btn"
                  >
                    {deleting ? 'Archiveren...' : 'Archiveren'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowDeleteConfirm(false); setDeleteError(null) }}
                    className="rounded-md border border-orange-300 px-3 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100"
                    data-testid="budget-delete-cancel-btn"
                  >
                    Annuleren
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 border-t border-[var(--border-ed)] px-6 py-4">
          {/* Ordering buttons */}
          {siblings.length > 1 && (
            <div className="flex gap-1">
              <button
                type="button"
                disabled={!canMoveUp || reordering}
                onClick={() => moveBudget('up')}
                title="Omhoog"
                className="inline-flex items-center justify-center rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-2 text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] disabled:opacity-30"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={!canMoveDown || reordering}
                onClick={() => moveBudget('down')}
                title="Omlaag"
                className="inline-flex items-center justify-center rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-2 text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] disabled:opacity-30"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => openWithMessage(`Analyseer mijn ${budget.name} budget`)}
            className="inline-flex flex-shrink-0 items-center justify-center gap-1.5 rounded-lg border border-wil-200 bg-wil-50 px-3 py-2 text-xs font-medium text-wil-700 transition-colors hover:bg-wil-100 hover:border-wil-300"
            title="Vraag Will om advies over dit budget"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Vraag Will
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-kern-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-kern-700"
          >
            <Pencil className="h-3.5 w-3.5" />
            Bewerken
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-orange-200 bg-[var(--paper)] px-3 py-2 text-xs font-medium text-orange-600 transition-colors hover:bg-orange-50 hover:border-orange-300"
            data-testid="budget-delete-btn"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Archiveren
          </button>
        </div>
    </ShellOverlay>
    {txToEdit && (
      <TransactionForm
        transaction={txToEdit}
        accountId={txToEdit.account_id}
        budgetGroups={budgetGroups}
        onClose={() => setTxToEdit(null)}
        onSaved={() => {
          setTxToEdit(null)
          onGoalCreated?.()
        }}
      />
    )}
    </>
  )
}

// ── Budget edit modal ────────────────────────────────────────

function BudgetEditModal({
  budget,
  isParent = false,
  allBudgets = [],
  childrenLimitSum,
  onClose,
  onSaved,
}: {
  budget: Budget
  isParent?: boolean
  allBudgets?: BudgetWithChildren[]
  childrenLimitSum?: number
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(budget.name)
  const [icon, setIcon] = useState(budget.icon)
  const [description, setDescription] = useState(budget.description ?? '')
  const [defaultLimit, setDefaultLimit] = useState(String(budget.default_limit))
  const [budgetType, setBudgetType] = useState(budget.budget_type ?? 'expense')
  const [interval, setInterval] = useState(budget.interval ?? 'monthly')
  const [rolloverType, setRolloverType] = useState(budget.rollover_type ?? 'reset')
  const [limitType, setLimitType] = useState(budget.limit_type ?? 'soft')
  const [alertThreshold, setAlertThreshold] = useState(budget.alert_threshold ?? 80)
  const [maxSingleAmount, setMaxSingleAmount] = useState(String(budget.max_single_transaction_amount ?? 0))
  const [isEssential, setIsEssential] = useState(budget.is_essential ?? false)
  const [priorityScore, setPriorityScore] = useState(budget.priority_score ?? 3)
  const [isInflationIndexed, setIsInflationIndexed] = useState(budget.is_inflation_indexed ?? false)
  const [saving, setSaving] = useState(false)
  const [showIcons, setShowIcons] = useState(false)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const [nibudAmount, setNibudAmount] = useState<number | null>(null)
  // Household ownership
  const [ownership, setOwnership] = useState<OwnershipType>(budget.ownership ?? 'personal')
  const { hasHousehold, householdId } = useHouseholdStatus()
  // Goal type fields
  const [goalType, setGoalType] = useState(budget.goal_type ?? '')
  const [goalAmount, setGoalAmount] = useState(budget.goal_amount ? String(budget.goal_amount) : '')
  const [goalDate, setGoalDate] = useState(budget.goal_date ?? '')
  const [goalFrequency, setGoalFrequency] = useState(budget.goal_frequency ?? '')
  // De Wil goal linking
  const [linkedGoalId, setLinkedGoalId] = useState<string>('')
  const [availableSavingsGoals, setAvailableSavingsGoals] = useState<
    { id: string; name: string; target_value: number; target_date: string | null }[]
  >([])
  const [showCreateGoal, setShowCreateGoal] = useState(false)
  const [isFavorite, setIsFavorite] = useState(budget.is_favorite ?? false)
  // Parent selector for sub-budgets
  const isChild = !!budget.parent_id
  const [parentId, setParentId] = useState(budget.parent_id ?? '')
  const parentOptions = allBudgets.filter(b => b.id !== budget.id)

  // Track dirty state
  const isDirty = useMemo(() => {
    return (
      name !== budget.name ||
      icon !== budget.icon ||
      description !== (budget.description ?? '') ||
      defaultLimit !== String(budget.default_limit) ||
      budgetType !== (budget.budget_type ?? 'expense') ||
      interval !== (budget.interval ?? 'monthly') ||
      rolloverType !== (budget.rollover_type ?? 'reset') ||
      limitType !== (budget.limit_type ?? 'soft') ||
      alertThreshold !== (budget.alert_threshold ?? 80) ||
      maxSingleAmount !== String(budget.max_single_transaction_amount ?? 0) ||
      isEssential !== (budget.is_essential ?? false) ||
      priorityScore !== (budget.priority_score ?? 3) ||
      isInflationIndexed !== (budget.is_inflation_indexed ?? false) ||
      ownership !== (budget.ownership ?? 'personal') ||
      goalType !== (budget.goal_type ?? '') ||
      goalAmount !== (budget.goal_amount ? String(budget.goal_amount) : '') ||
      goalDate !== (budget.goal_date ?? '') ||
      goalFrequency !== (budget.goal_frequency ?? '') ||
      isFavorite !== (budget.is_favorite ?? false) ||
      parentId !== (budget.parent_id ?? '')
    )
  }, [name, icon, description, defaultLimit, budgetType, interval, rolloverType, limitType, alertThreshold, maxSingleAmount, isEssential, priorityScore, isInflationIndexed, ownership, goalType, goalAmount, goalDate, goalFrequency, isFavorite, parentId, budget])

  // beforeunload warning for page refresh
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = 'Je hebt onopgeslagen wijzigingen. Weet je zeker dat je wilt vernieuwen?'
      return e.returnValue
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  // Load De Wil savings goals + existing linked goal
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('goals')
      .select('id, name, target_value, target_date')
      .eq('goal_type', 'savings')
      .eq('is_completed', false)
      .order('sort_order', { ascending: true })
      .then(({ data }) => { if (data) setAvailableSavingsGoals(data) })
    supabase
      .from('goals')
      .select('id')
      .eq('budget_id', budget.id)
      .maybeSingle()
      .then(({ data }) => { if (data) setLinkedGoalId(data.id) })
  }, [budget.id])

  // Fetch NIBUD reference amount for child budgets with a slug
  useEffect(() => {
    if (!budget.slug || budget.parent_id === null) return // Only for child budgets with slugs

    async function fetchNibud() {
      const supabase = createClient()
      const { data } = await supabase
        .from('nibud_reference_data')
        .select('basis_amount')
        .eq('mapped_budget_slug', budget.slug)
        .order('year', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (data) {
        setNibudAmount(Number(data.basis_amount))
      } else {
        setNibudAmount(null)
      }
    }

    fetchNibud()
  }, [budget.slug, budget.parent_id])

  // Handle close with unsaved changes confirmation
  function handleClose() {
    if (isDirty) {
      setShowCloseConfirm(true)
    } else {
      onClose()
    }
  }

  function confirmClose() {
    setShowCloseConfirm(false)
    onClose()
  }

  function cancelClose() {
    setShowCloseConfirm(false)
  }

  // Effective month for limit changes
  const now = new Date()
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [effectiveFrom, setEffectiveFrom] = useState(currentPeriod)

  const limitChanged = !isParent && (parseFloat(defaultLimit) || 0) !== Number(budget.default_limit)

  // Generate month options: current month + up to 12 months back
  const monthOptions: { value: string; label: string }[] = []
  for (let i = 0; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
    monthOptions.push({ value, label })
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)

    const supabase = createClient()
    const newLimit = isParent ? Number(budget.default_limit) : (parseFloat(defaultLimit) || 0)

    const { error } = await supabase
      .from('budgets')
      .update({
        name: name.trim(),
        icon,
        description: description.trim() || null,
        default_limit: newLimit,
        budget_type: budgetType,
        parent_id: isChild ? (parentId || null) : budget.parent_id,
        interval,
        rollover_type: rolloverType,
        limit_type: limitType,
        alert_threshold: alertThreshold,
        max_single_transaction_amount: parseFloat(maxSingleAmount) || 0,
        is_essential: isEssential,
        priority_score: priorityScore,
        is_inflation_indexed: isInflationIndexed,
        ownership: ownership,
        household_id: ownership === 'shared' ? householdId : null,
        goal_type: goalType || null,
        goal_amount: parseFloat(goalAmount) || null,
        goal_date: goalDate || null,
        goal_frequency: goalFrequency || null,
        is_favorite: isFavorite,
        updated_at: new Date().toISOString(),
      })
      .eq('id', budget.id)

    // If limit changed, record in budget_amounts with effective_from
    if (!error && limitChanged) {
      const effectiveDate = `${effectiveFrom}-01`

      const { data: existing } = await supabase
        .from('budget_amounts')
        .select('id')
        .eq('budget_id', budget.id)
        .limit(1)

      if (!existing || existing.length === 0) {
        await supabase
          .from('budget_amounts')
          .insert({
            budget_id: budget.id,
            effective_from: '2020-01-01',
            amount: Number(budget.default_limit),
          })
      }

      await supabase
        .from('budget_amounts')
        .delete()
        .eq('budget_id', budget.id)
        .eq('effective_from', effectiveDate)

      await supabase
        .from('budget_amounts')
        .insert({
          budget_id: budget.id,
          effective_from: effectiveDate,
          amount: newLimit,
        })
    }

    // Goal linking for spaardoel
    if (!error && goalType === 'spaardoel') {
      const { data: oldLinked } = await supabase.from('goals').select('id').eq('budget_id', budget.id)
      for (const old of oldLinked ?? []) {
        if (old.id !== linkedGoalId) {
          await supabase.from('goals').update({ budget_id: null }).eq('id', old.id)
        }
      }
      if (linkedGoalId) {
        await supabase.from('goals').update({ budget_id: budget.id }).eq('id', linkedGoalId)
      }
    } else if (!error && budget.goal_type === 'spaardoel' && goalType !== 'spaardoel') {
      await supabase.from('goals').update({ budget_id: null }).eq('budget_id', budget.id)
    }

    setSaving(false)
    if (!error) onSaved()
  }

  const SelectedIcon = iconMap[icon] ?? iconMap['Circle']
  const inputCls = 'w-full rounded-lg border border-[var(--border-ed)] px-3 py-2 text-sm text-[var(--ink)] focus:border-kern-500 focus:outline-none focus:ring-1 focus:ring-kern-500'

  return (
    <>
    {/* Edit-mode binnen pane (plan §6.4): zelfde pane-shell als detail-view,
        andere content. URL-state: `?budget=<id>&edit=true`. `handleClose`
        opent eventueel eerst een unsaved-changes-bevestiging; bij confirm
        wordt `onClose` aangeroepen die teruggaat naar `?budget=<id>` (detail). */}
    <ShellOverlay open={true} onClose={handleClose} kind="pane" title="Budget bewerken">
        <div className="flex justify-end px-6 pt-3">
          <button type="button" onClick={() => setIsFavorite(!isFavorite)}
            className={`rounded-lg p-1.5 transition-colors ${
              isFavorite ? 'text-red-500 hover:text-red-600' : 'text-[var(--ink-4)] hover:text-[var(--ink-3)]'
            }`}
            title={isFavorite ? 'Verwijder uit favorieten' : 'Markeer als favoriet'}
          >
            <Heart className={`h-5 w-5 ${isFavorite ? 'fill-current' : ''}`} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-4">
          {/* Unsaved changes close confirmation */}
          {showCloseConfirm && (
            <div className="rounded-lg border border-orange-300 bg-orange-50 p-3" data-testid="modal-unsaved-changes-warning">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-orange-800">Onopgeslagen wijzigingen</p>
                  <p className="mt-1 text-xs text-orange-700">
                    Je hebt wijzigingen die nog niet zijn opgeslagen. Wil je deze verwijderen of verder bewerken?
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={confirmClose}
                      className="rounded-md bg-orange-600 px-3 py-1 text-xs font-medium text-white hover:bg-orange-700"
                      data-testid="modal-confirm-close-btn"
                    >
                      Wijzigingen verwijderen
                    </button>
                    <button
                      type="button"
                      onClick={cancelClose}
                      className="rounded-md border border-orange-300 px-3 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100"
                      data-testid="modal-cancel-close-btn"
                    >
                      Verder bewerken
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Dirty indicator */}
          {isDirty && !showCloseConfirm && (
            <div className="flex items-center gap-1.5 rounded-md bg-kern-50 px-3 py-1.5 border border-kern-200" data-testid="modal-dirty-indicator">
              <div className="h-2 w-2 rounded-full bg-kern-500 animate-pulse" />
              <span className="text-[11px] font-medium text-kern-700">Onopgeslagen wijzigingen</span>
            </div>
          )}
          {/* ── BASIS ─────────────────────────────────────────── */}

          {/* Icoon + Naam */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowIcons(!showIcons)}
              aria-label="Icoon kiezen"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--r)] border border-[var(--border-ed)] text-[var(--ink-3)] hover:border-kern-300 hover:bg-kern-50"
            >
              <SelectedIcon className="h-5 w-5" />
            </button>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`flex-1 ${inputCls}`}
              placeholder="Naam"
              aria-label="Naam"
            />
          </div>

          {showIcons && (
            <div className="flex flex-wrap gap-1">
              {iconOptions.map((iconName) => {
                const Icon = iconMap[iconName]
                return (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => { setIcon(iconName); setShowIcons(false) }}
                    className={`flex h-8 w-8 items-center justify-center rounded-[var(--r)] border text-xs transition-colors ${
                      icon === iconName
                        ? 'border-kern-500 bg-kern-50 text-kern-600'
                        : 'border-[var(--border-ed)] text-[var(--ink-3)] hover:border-[var(--border-md)] hover:text-[var(--ink-2)]'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                )
              })}
            </div>
          )}

          {/* Type (pill-row) */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">Type</label>
            <div className="flex flex-wrap gap-1.5">
              {([
                { value: 'income', label: 'Inkomen' },
                { value: 'expense', label: 'Uitgave' },
                { value: 'savings', label: 'Sparen' },
                { value: 'debt', label: 'Schuld' },
                { value: 'archive', label: 'Archief' },
              ] as const).map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setBudgetType(value)}
                  className={`min-h-[36px] rounded-[var(--r)] border px-3 py-1.5 text-xs font-medium transition-colors ${
                    budgetType === value
                      ? 'bg-kern-50 border-kern-300 text-kern-700'
                      : 'border-[var(--border-ed)] text-[var(--ink-3)] hover:border-[var(--border-md)] hover:text-[var(--ink-2)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Bedrag */}
          <div>
            <label htmlFor="budget-limit" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">Bedrag</label>
            {isParent ? (
              <div className={`${inputCls} cursor-not-allowed bg-[var(--subtle)] text-[var(--ink-3)] font-mono tabular-nums`}>
                {<MaskedAmount value={childrenLimitSum ?? 0} tone="wil" />}
                <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">Som van sub-budgetten — pas de kinderen aan</p>
              </div>
            ) : (
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-[var(--ink-3)]">€</span>
                <input
                  id="budget-limit"
                  type="number" min="0" step="0.01"
                  inputMode="decimal"
                  value={defaultLimit}
                  onChange={(e) => setDefaultLimit(e.target.value)}
                  className={`${inputCls} pl-7 font-mono tabular-nums`}
                />
              </div>
            )}
            {nibudAmount !== null && nibudAmount > 0 && (
              <p className="mt-1 flex items-center gap-1 text-xs text-[var(--ink-3)]">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--ink-4)]" />
                NIBUD-richtlijn: <span className="font-mono font-medium text-[var(--ink-2)]">{<MaskedAmount value={nibudAmount} tone="wil" />}/mnd</span>
              </p>
            )}
          </div>

          {/* Ingangsmaand — verschijnt alleen als bedrag gewijzigd is */}
          {limitChanged && (
            <div>
              <label htmlFor="effective-from" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">Ingangsmaand</label>
              <select
                id="effective-from"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                className={`${inputCls} capitalize`}
              >
                {monthOptions.map((opt) => (
                  <option key={opt.value} value={opt.value} className="capitalize">{opt.label}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-[var(--ink-3)] leading-relaxed">
                Eerdere maanden behouden de oude limiet van <span className="font-mono tabular-nums">{<MaskedAmount value={Number(budget.default_limit)} tone="wil" />}</span>.
              </p>
            </div>
          )}

          {/* Essentieel */}
          <div>
            <label className="flex cursor-pointer items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEssential(!isEssential)}
                aria-pressed={isEssential}
                aria-describedby="essential-help"
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${isEssential ? 'bg-kern-500' : 'bg-zinc-300'}`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-[var(--paper)] transition-transform ${isEssential ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
              <span className="text-sm font-medium text-[var(--ink-2)]">Essentieel</span>
            </label>
            <p id="essential-help" className="mt-1 text-xs text-[var(--ink-3)] leading-relaxed">
              Essentiële budgetten tellen mee voor je FIRE-berekening als vaste last na pensioen.
            </p>
          </div>

          {/* Beschrijving */}
          <div>
            <label htmlFor="budget-description" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              Beschrijving <span className="font-normal text-[var(--ink-3)]">(optioneel)</span>
            </label>
            <textarea
              id="budget-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={inputCls}
            />
          </div>

          {/* ── GEAVANCEERD (ingeklapt) ──────────────────────── */}
          <CollapsibleSection
            storageKey="budget-edit-advanced"
            title="Geavanceerde instellingen"
            summary="interval · overschot · drempels · prioriteit · context"
            defaultOpen={false}
          >
            <div className="space-y-6">

              {/* Sub-groep A — Gedrag over tijd */}
              <section>
                <h4 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">
                  Gedrag over tijd
                </h4>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="budget-interval" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">Interval</label>
                    <select
                      id="budget-interval"
                      aria-describedby="budget-interval-help"
                      value={interval}
                      onChange={(e) => setInterval(e.target.value as 'monthly' | 'quarterly' | 'yearly')}
                      className={inputCls}
                    >
                      <option value="monthly">Maandelijks</option>
                      <option value="quarterly">Per kwartaal</option>
                      <option value="yearly">Jaarlijks</option>
                    </select>
                    <p id="budget-interval-help" className="mt-1 text-xs text-[var(--ink-3)] leading-relaxed">
                      Maandelijks voor vaste lasten; Per kwartaal voor gas/water-afrekening; Jaarlijks voor verzekeringspremies of vakantie.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">Overschot-beheer</label>
                    <div
                      className="flex flex-wrap gap-1.5"
                      role="radiogroup"
                      aria-describedby="rollover-help"
                      aria-label="Overschot-beheer"
                    >
                      {([
                        { value: 'reset', label: 'Reset' },
                        { value: 'carry-over', label: 'Doorschuiven' },
                        { value: 'invest-sweep', label: 'Beleggen-sweep' },
                      ] as const).map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={rolloverType === value}
                          onClick={() => setRolloverType(value)}
                          className={`min-h-[36px] rounded-[var(--r)] border px-3 py-1.5 text-xs font-medium transition-colors ${
                            rolloverType === value
                              ? 'bg-kern-50 border-kern-300 text-kern-700'
                              : 'border-[var(--border-ed)] text-[var(--ink-3)] hover:border-[var(--border-md)] hover:text-[var(--ink-2)]'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p id="rollover-help" className="mt-1 text-xs text-[var(--ink-3)] leading-relaxed">
                      Reset start elke maand opnieuw. Doorschuiven rolt het niet-bestede deel naar volgende maand — handig voor een vakantiepot. Beleggen-sweep boekt het overschot als spaar/invest-bedrag.
                    </p>
                  </div>

                  <div>
                    <label className="flex cursor-pointer items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsInflationIndexed(!isInflationIndexed)}
                        aria-pressed={isInflationIndexed}
                        aria-describedby="inflation-help"
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${isInflationIndexed ? 'bg-kern-500' : 'bg-zinc-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 rounded-full bg-[var(--paper)] transition-transform ${isInflationIndexed ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                      <span className="text-sm font-medium text-[var(--ink-2)]">Inflatie-indexering</span>
                    </label>
                    <p id="inflation-help" className="mt-1 text-xs text-[var(--ink-3)] leading-relaxed">
                      Het budget groeit jaarlijks automatisch mee met de inflatie. Ideaal voor boodschappen, energie en huur.
                    </p>
                  </div>
                </div>
              </section>

              {/* Sub-groep B — Limieten & signalen */}
              <section>
                <h4 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">
                  Limieten &amp; signalen
                </h4>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">Limiet-type</label>
                    <div
                      className="flex flex-wrap gap-1.5"
                      role="radiogroup"
                      aria-describedby="limit-type-help"
                      aria-label="Limiet-type"
                    >
                      {([
                        { value: 'soft', label: 'Zacht' },
                        { value: 'hard', label: 'Hard' },
                      ] as const).map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={limitType === value}
                          onClick={() => setLimitType(value)}
                          className={`min-h-[36px] rounded-[var(--r)] border px-3 py-1.5 text-xs font-medium transition-colors ${
                            limitType === value
                              ? 'bg-kern-50 border-kern-300 text-kern-700'
                              : 'border-[var(--border-ed)] text-[var(--ink-3)] hover:border-[var(--border-md)] hover:text-[var(--ink-2)]'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p id="limit-type-help" className="mt-1 text-xs text-[var(--ink-3)] leading-relaxed">
                      Zacht geeft een waarschuwing bij overschrijding maar laat transacties toe. Hard probeert transacties boven de limiet te blokkeren (waar technisch mogelijk).
                    </p>
                  </div>

                  <div>
                    <label htmlFor="alert-threshold" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                      Notificatiedrempel: <span className="font-mono tabular-nums text-kern-700">{alertThreshold}%</span>
                    </label>
                    <input
                      id="alert-threshold"
                      type="range" min="0" max="100" step="5"
                      value={alertThreshold}
                      onChange={(e) => setAlertThreshold(parseInt(e.target.value))}
                      aria-describedby="alert-threshold-help"
                      className="w-full accent-kern-500"
                    />
                    <p id="alert-threshold-help" className="mt-1 text-xs text-[var(--ink-3)] leading-relaxed">
                      Krijg een melding wanneer je dit percentage van je budget bereikt. Standaard 80%.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="max-single" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">Max transactiebedrag</label>
                    <div className="relative w-40">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-[var(--ink-3)]">€</span>
                      <input
                        id="max-single"
                        type="number" min="0" step="0.01"
                        inputMode="decimal"
                        value={maxSingleAmount}
                        onChange={(e) => setMaxSingleAmount(e.target.value)}
                        aria-describedby="max-single-help"
                        className={`${inputCls} pl-7 font-mono tabular-nums`}
                        placeholder="0"
                      />
                    </div>
                    <p id="max-single-help" className="mt-1 text-xs text-[var(--ink-3)] leading-relaxed">
                      Waarschuwing als één transactie groter is dan dit bedrag. Voorkomt dat één uitschieter je budget uitput. 0 = geen limiet.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">Prioriteit</label>
                    <div
                      className="flex gap-1.5"
                      role="radiogroup"
                      aria-describedby="priority-help"
                      aria-label="Prioriteit"
                    >
                      {[1, 2, 3, 4, 5].map((score) => (
                        <button
                          key={score}
                          type="button"
                          role="radio"
                          aria-checked={priorityScore === score}
                          onClick={() => setPriorityScore(score)}
                          className={`flex h-11 w-11 items-center justify-center rounded-[var(--r)] border text-sm font-medium font-mono tabular-nums transition-colors ${
                            priorityScore === score
                              ? 'border-kern-500 bg-kern-50 text-kern-700'
                              : 'border-[var(--border-ed)] text-[var(--ink-3)] hover:border-[var(--border-md)]'
                          }`}
                        >
                          {score}
                        </button>
                      ))}
                    </div>
                    <p id="priority-help" className="mt-1 text-xs text-[var(--ink-3)] leading-relaxed">
                      Bepaalt volgorde in aanbevelingen en het Te Verdelen-advies. 1 = laagste, 5 = hoogste. Standaard 3.
                    </p>
                  </div>
                </div>
              </section>

              {/* Sub-groep C — Context */}
              {(isChild || !isParent || hasHousehold) && (
                <section>
                  <h4 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">
                    Context
                  </h4>
                  <div className="space-y-4">

                    {isChild && parentOptions.length > 0 && (
                      <div>
                        <label htmlFor="budget-parent" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">Hoofdbudget</label>
                        <select
                          id="budget-parent"
                          aria-describedby="parent-help"
                          value={parentId}
                          onChange={(e) => setParentId(e.target.value)}
                          className={inputCls}
                        >
                          {parentOptions.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <p id="parent-help" className="mt-1 text-xs text-[var(--ink-3)] leading-relaxed">
                          Verplaats dit deelbudget naar een andere hoofdcategorie. Transacties blijven gekoppeld.
                        </p>
                      </div>
                    )}

                    {!isParent && (
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                          Doeltype <span className="font-normal text-[var(--ink-3)]">(optioneel)</span>
                        </label>
                        <div
                          className="flex flex-wrap gap-1.5"
                          role="radiogroup"
                          aria-describedby="goal-type-help"
                          aria-label="Doeltype"
                        >
                          {([
                            { value: '', label: 'Geen' },
                            { value: 'vaste_maandlast', label: 'Vaste maandlast' },
                            { value: 'bestedingslimiet', label: 'Bestedingslimiet' },
                            { value: 'spaardoel', label: 'Spaardoel' },
                            { value: 'maandelijkse_reservering', label: 'Reservering' },
                            { value: 'periodieke_last', label: 'Periodieke last' },
                          ] as const).map(({ value, label }) => (
                            <button
                              key={value}
                              type="button"
                              role="radio"
                              aria-checked={goalType === value}
                              onClick={() => {
                                setGoalType(value)
                                if (value !== 'spaardoel') { setGoalDate(''); if (value !== 'periodieke_last') setGoalAmount('') }
                                if (value !== 'periodieke_last') setGoalFrequency('')
                                if (value === 'maandelijkse_reservering') setRolloverType('carry-over')
                              }}
                              className={`min-h-[36px] rounded-[var(--r)] border px-3 py-1.5 text-xs font-medium transition-colors ${
                                goalType === value
                                  ? 'bg-kern-50 border-kern-300 text-kern-700'
                                  : 'border-[var(--border-ed)] text-[var(--ink-3)] hover:border-[var(--border-md)] hover:text-[var(--ink-2)]'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <p id="goal-type-help" className="mt-1 text-xs text-[var(--ink-3)] leading-relaxed">
                          Geen = gewoon budget. Vaste maandlast = terugkerende vaste post (hypotheek). Bestedingslimiet = plafond op variabele uitgaven. Spaardoel = koppelen aan een doel in De Wil. Reservering = maandelijks saldo opbouwen. Periodieke last = kost die elk kwartaal/jaar terugkomt, verspreid over maanden.
                        </p>

                        {goalType === 'spaardoel' && (
                          <div className="mt-2">
                            {availableSavingsGoals.length > 0 && (
                              <select
                                value={linkedGoalId}
                                onChange={(e) => {
                                  const gid = e.target.value
                                  setLinkedGoalId(gid)
                                  if (gid) {
                                    const g = availableSavingsGoals.find(x => x.id === gid)
                                    if (g) { setGoalAmount(String(g.target_value)); setGoalDate(g.target_date ?? '') }
                                  } else {
                                    setGoalAmount(''); setGoalDate('')
                                  }
                                }}
                                className={inputCls}
                              >
                                <option value="">— Geen koppeling —</option>
                                {availableSavingsGoals.map(g => (
                                  <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                              </select>
                            )}
                            {linkedGoalId && (
                              <p className="mt-1 text-xs text-wil-600 leading-relaxed">Doelbedrag en einddatum worden overgenomen uit het gekoppelde doel.</p>
                            )}
                            <button
                              type="button"
                              onClick={() => setShowCreateGoal(true)}
                              className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-wil-600 hover:text-wil-700"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Maak nieuw doel aan in De Wil
                            </button>
                          </div>
                        )}

                        {goalType === 'periodieke_last' && (
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <div>
                              <label className="mb-1 block text-[10px] font-medium text-[var(--ink-3)]">Totaalbedrag (€)</label>
                              <input
                                type="number" min="0" step="0.01"
                                inputMode="decimal"
                                value={goalAmount}
                                onChange={(e) => setGoalAmount(e.target.value)}
                                className={`${inputCls} font-mono tabular-nums`}
                                placeholder="bijv. 600"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-[10px] font-medium text-[var(--ink-3)]">Frequentie</label>
                              <select value={goalFrequency} onChange={(e) => setGoalFrequency(e.target.value)} className={inputCls}>
                                <option value="">Kies frequentie</option>
                                <option value="jaarlijks">Jaarlijks</option>
                                <option value="halfjaarlijks">Halfjaarlijks</option>
                                <option value="kwartaal">Kwartaal</option>
                              </select>
                            </div>
                          </div>
                        )}

                        {goalType === 'maandelijkse_reservering' && (
                          <p className="mt-1.5 text-xs text-[var(--ink-3)] leading-relaxed">
                            Rollover wordt automatisch ingesteld op &apos;Doorschuiven&apos;.
                          </p>
                        )}
                      </div>
                    )}

                    {hasHousehold && (
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">Eigendom</label>
                        <OwnershipToggle
                          value={ownership}
                          onChange={setOwnership}
                          hasHousehold={hasHousehold}
                          compact
                        />
                        <p className="mt-1 text-xs text-[var(--ink-3)] leading-relaxed">
                          Persoonlijk of gedeeld met je huishouden. Gedeelde budgetten verdelen kosten automatisch volgens je huishoud-verhouding.
                        </p>
                      </div>
                    )}

                  </div>
                </section>
              )}
            </div>
          </CollapsibleSection>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border-ed)] px-6 py-4">
          <button onClick={handleClose} className="rounded-lg border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]">
            Annuleren
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Opslaan...' : 'Opslaan'}
          </button>
        </div>
    </ShellOverlay>

    {showCreateGoal && (
      <GoalForm
        assets={[]}
        debts={[]}
        lockedToSavings
        onClose={() => setShowCreateGoal(false)}
        onSaved={async (newGoalId) => {
          setShowCreateGoal(false)
          if (newGoalId) {
            const supabase = createClient()
            const { data } = await supabase
              .from('goals')
              .select('id, name, target_value, target_date')
              .eq('goal_type', 'savings')
              .eq('is_completed', false)
              .order('sort_order', { ascending: true })
            setAvailableSavingsGoals(data ?? [])
            setLinkedGoalId(newGoalId)
            const newGoal = data?.find(g => g.id === newGoalId)
            if (newGoal) { setGoalAmount(String(newGoal.target_value)); setGoalDate(newGoal.target_date ?? '') }
          }
        }}
        initialValues={{ target_value: goalAmount || undefined, target_date: goalDate || undefined }}
      />
    )}
    </>
  )
}

