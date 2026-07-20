'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ArrowRight } from 'lucide-react'
import { PageInfoButton } from '@/components/editorial'
import { PAGE_INFO } from '@/lib/page-info-content'
import { BottomSheet } from '@/components/app/bottom-sheet'
import type { HealthScore } from '@/lib/financial-health'
import type { GoalWithBudget } from '@/lib/fin-data-loader'
import type { DashboardData } from '@/components/widgets/widget-renderer'
import type { WidgetPref } from '@/lib/widget-catalog'
import type { HefbomenHousingSplit } from './overzicht-hero/hefbomen-nav'
import { BriefingPanel, type BriefingEntry, type BriefingWeekHistoryItem } from './briefing-panel'
import type { FreedomHeroProps } from '@/lib/briefing/overview-briefing'
import { MiniNetWorthChart } from './mini-networth-chart'
import { HealthScoreCard } from './overzicht-hero/health-score-card'
import {
  HealthScoreEmptyState,
  DoelenEmptyState,
} from './overzicht-hero/empty-states'
import {
  VoortgangDoelenCard,
  type GoalProgress,
} from './overzicht-hero/voortgang-doelen-card'
import { VrijheidStrip } from './overzicht-hero/vrijheid-strip'
import type { FreedomFraming } from '@/lib/fire-strategy'
import { PageStatusDot } from '@/components/app/page-status-dot'
import {
  HeroEditToggle,
  HeroWidgetRail,
  useHeroRailState,
} from './hero-widget-rail'
import { CompoundInsightCard } from './compound-insight-card'
import { PrintOverzichtButton } from './print-overzicht-button'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import { dailyExpenseRate } from '@/lib/format'

// Stabiele lege-array-referentie voor de mini-vermogen-grafiek. Voorkomt dat
// `netWorthHistory ?? []` bij ontbrekende historie elke render een verse
// array-ref maakt — die zou de memo op MiniNetWorthChart telkens breken.
const EMPTY_NET_WORTH_HISTORY: { month: string; value: number }[] = []

// HealthScoreReceipt (1011 r) uit het first-load client-JS-chunk van /overzicht
// gehaald (perf Task 3.2) — hij zit alleen in een BottomSheet die pas opent na
// een klik op de Health-Score-card. `loading: null` is bewust: de BottomSheet
// mount pas ná die klik, dus een skeleton zou hooguit één frame flitsen.
const HealthScoreReceipt = dynamic(
  () =>
    import('@/components/app/horizon/health-score-receipt').then(m => ({
      default: m.HealthScoreReceipt,
    })),
  { ssr: false, loading: () => null },
)

/**
 * OverzichtSecondary — het GESTREAMDE tweede blok van /overzicht (perf Task
 * 2.4). Alles wat op de zware `loadDashboardData` (+ will/aandachtspunten/
 * briefing/snapshot) wacht, leeft hier: de Health-Score-card, de mini-vermogen-
 * grafiek, de widget-rail (Voortgang + Vrijheid of power-user-widgets), de
 * compound-insight en het briefing-panel — plus de utility-controls
 * (bewerken/print/status-dot/`i`) die rechtsboven over de hero zweven.
 *
 * Blok 1 (de getrimde visuele hero: begroeting + vier-hefbomen-kompas) rendert
 * in `OverzichtHeroPrimary` zónder op deze data te wachten; dit blok komt er
 * onder een `<Suspense>` achteraan gestroomd. De props zijn puur
 * consume-only afgeleiden uit de loaders (server-side berekend in
 * `OverzichtSecondaryLoader`) — hier wordt niets herberekend.
 */
export type OverzichtSecondaryProps = {
  health: HealthScore | null
  goals?: GoalWithBudget[]
  goalProgresses?: GoalProgress[]
  /** Percentage op weg naar financiële vrijheid (0-100). Uit healthScoreInput. */
  freedomPct?: number | null
  /** Huidige leeftijd (afgerond) — null bij ontbrekende DOB. */
  currentAge?: number | null
  /** Vrijheidsleeftijd / pensioenleeftijd uit fireStrategy.endAge. */
  endAge?: number | null
  /** Pensioen-modus uit fireStrategy.strategy === 'pensioen'. */
  isPensioenMode?: boolean
  /**
   * Afgeleide vrijheids-/pensioenframing uit de gedeelde, consume-only vlag
   * (`resolveFreedomFraming`). Stuurt de Vrijheid-strip. Default 'building'.
   */
  freedomFraming?: FreedomFraming
  /**
   * Dubbele grondslag incl./excl. eigen woning — bron = `horizonData`
   * (perspectief-correct). Aanwezig (non-null) ⇔ `showDualHousingBasis`. Voedt
   * de "excl. eigen woning"-markers op de vermogensgrafiek. Null → geen
   * splitsing.
   */
  housingSplit?: HefbomenHousingSplit | null
  /** Nettovermogen excl. eigen woning — losse regel onder het kopgetal. */
  netWorthExclHome?: number | null
  /** Briefing-entries onder de hero (max 6, 3-koloms grid). */
  briefingEntries?: BriefingEntry[]
  /** ISO-tijdstip waarop de briefing voor vandaag is vastgezet ("Bijgewerkt …"). */
  briefingRefreshedAt?: string | null
  /** Live cijfers wijken af van het bevroren weekbeeld → freshness-hint. */
  briefingDataChanged?: boolean
  /** Of de handmatige ververs vandaag nog beschikbaar is (max 1×/dag). */
  briefingCanRefresh?: boolean
  /** Vrijheidstijd-hero bovenaan de briefing (week-over-week delta). */
  freedomHero?: FreedomHeroProps | null
  /** Eén-zin kop boven de briefjes. */
  briefingHeadline?: string | null
  /** Afgesloten weken uit de snapshot-historie (terugblik-disclosure). */
  briefingWeekHistory?: BriefingWeekHistoryItem[]
  /** Inputs voor mini-vermogen-grafiek naast Health Score. */
  netWorthHistory?: { month: string; value: number }[]
  currentNetWorth?: number | null
  fireAge?: number | null
  /** Per-jaar geprojecteerd VOLLEDIG netto vermogen uit de loader. */
  simNetWorthRows?: { age: number; netWorth: number }[] | null
  /** Geschat maandelijks spaarritme — back-cast voor ontbrekende historie. */
  monthlySavings?: number | null
  /** Liquide cash op spaarrekeningen — voor compound-insight reveal. */
  liquidCash?: number
  /** Doelbedrag bij vrijheid uit de simulatie — eindwaarde op de chart. */
  simRequiredPortfolio?: number | null
  /**
   * Volledige DashboardData voor de mini-chart (dailyExpense) en de optionele
   * HeroWidgetRail (power-user edit-mode). De widget-gated velden in de bundel
   * zijn leeg voor een minimaal-widget-account → kleinere RSC-flight; de rail
   * toont alleen ACTIEVE widgets, die per definitie hun data hebben.
   */
  dashboardData?: DashboardData
  /** Active + all widget-prefs voor de hero-rail. */
  activeWidgets?: WidgetPref[]
  allWidgetPrefs?: WidgetPref[]
}

export function OverzichtSecondary({
  health,
  goals,
  goalProgresses,
  freedomPct,
  currentAge,
  endAge,
  isPensioenMode,
  freedomFraming = 'building',
  housingSplit = null,
  netWorthExclHome,
  briefingEntries,
  briefingRefreshedAt,
  briefingDataChanged,
  briefingCanRefresh,
  freedomHero,
  briefingHeadline,
  briefingWeekHistory,
  netWorthHistory,
  currentNetWorth,
  fireAge,
  simNetWorthRows,
  monthlySavings,
  simRequiredPortfolio,
  dashboardData,
  activeWidgets,
  allWidgetPrefs,
  liquidCash,
}: OverzichtSecondaryProps) {
  const [receiptOpen, setReceiptOpen] = useState(false)
  const rail = useHeroRailState(activeWidgets ?? [])

  // SINGLE SOURCE OF TRUTH voor de weergavemodus: één read van useDisplayMode().
  // `simple` versobert /overzicht identiek aan de rest van de hero.
  const { mode } = useDisplayMode()
  const simple = mode === 'simple'

  // Canoniek dagtarief (EUR/dag) uit de dashboard-bundel — puur doorgegeven aan
  // de mini-vermogen-grafiek voor de vrijheidstijd-equivalent. Consume-don't-
  // recompute: neem het bundel-veld `dailyExpenseRate` (KRUIS-20); alleen als
  // dat ontbreekt vertaalt de canonieke helper de maanduitgaven.
  const dailyExpense = dashboardData
    ? dashboardData.dailyExpenseRate ?? dailyExpenseRate(dashboardData.monthlyExpenses)
    : undefined

  // Defensief: log dev-warning bij mismatch tussen goals + progresses-arrays.
  if (
    process.env.NODE_ENV !== 'production' &&
    goals &&
    goalProgresses &&
    goalProgresses.length > goals.length
  ) {
    console.warn(
      `[OverzichtSecondary] goalProgresses.length (${goalProgresses.length}) > ` +
        `goals.length (${goals.length}). Extra progresses worden genegeerd.`,
    )
  }

  // Telling + doelen-display in één memo op [goals, goalProgresses].
  const { goalDisplay, activeGoalCount } = useMemo(() => {
    const activeGoalCount = (goals ?? []).filter(
      (_, i) => (goalProgresses?.[i] ?? null) != null,
    ).length

    const goalDisplay = (goals ?? [])
      .map((g, i) => ({ goal: g, progress: goalProgresses?.[i] ?? null }))
      .filter(
        (g): g is { goal: GoalWithBudget; progress: GoalProgress } =>
          g.progress != null && g.progress.pct < 100,
      )
      .sort((a, b) => Number(!a.progress.onTrack) - Number(!b.progress.onTrack))
      .slice(0, 3)

    return { goalDisplay, activeGoalCount }
  }, [goals, goalProgresses])

  return (
    <>
      {/* Utility-controls die rechtsboven over de hero zweven. Ze wonen in dit
          gestreamde blok omdat de bewerken-toggle de widget-rail-state deelt
          (useHeroRailState) en de status-dot dezelfde server-seed als de
          briefing gebruikt — beide zijn per definitie blok-2. De begroeting in
          blok 1 houdt `pr-12 sm:pr-16` vrij, dus er is geen layout-shift als de
          cluster instroomt. */}
      <div className="absolute right-4 top-6 sm:right-6 sm:top-8 flex items-center gap-2">
        {dashboardData && !simple && (
          <HeroEditToggle
            isEditing={rail.isEditing}
            onToggle={() => rail.setIsEditing(!rail.isEditing)}
          />
        )}
        <PrintOverzichtButton />
        {/* Geminimaliseerde status-/vrijheidsmelding: gekleurd statuspunt direct
            links van de 'i' (meldingen-conventie). */}
        <PageStatusDot />
        <PageInfoButton description={PAGE_INFO['/overzicht'] ?? ''} />
      </div>

      {/* Hero-row: Health Score smaller (1/4) + chart breder (3/4), beide
          even hoog via items-stretch + h-full op de cards. */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 sm:gap-4 items-stretch">
        <div className="lg:col-span-1">
          {health ? (
            <HealthScoreCard health={health} onOpenReceipt={() => setReceiptOpen(true)} simple={simple} />
          ) : (
            <HealthScoreEmptyState />
          )}
        </div>
        <div className="lg:col-span-3">
          <div className="h-full">
            <MiniNetWorthChart
              netWorthHistory={netWorthHistory ?? EMPTY_NET_WORTH_HISTORY}
              currentNetWorth={currentNetWorth ?? 0}
              currentAge={currentAge ?? null}
              fireAge={fireAge ?? null}
              endAge={endAge ?? null}
              isPensioenMode={isPensioenMode ?? false}
              simNetWorthRows={simNetWorthRows ?? null}
              simRequiredPortfolio={simRequiredPortfolio ?? null}
              monthlySavings={monthlySavings ?? null}
              netWorthExclHome={netWorthExclHome ?? null}
              showExclHome={housingSplit != null}
              dailyExpense={dailyExpense}
            />
          </div>
        </div>
      </div>

      {/* Optionele power-user widget-rail OP DEZELFDE PLEK als Voortgang-
          doelen + Vrijheidsstrip. In Eenvoudig verbergen we dit hele blok. */}
      {!simple && (
      <div className="mt-3 sm:mt-4">
        {dashboardData && activeWidgets && allWidgetPrefs ? (
          <HeroWidgetRail
            isEditing={rail.isEditing}
            onEditModeChange={rail.setIsEditing}
            hasActiveWidgets={rail.hasActiveWidgets}
            activeWidgets={activeWidgets}
            allPrefs={allWidgetPrefs}
            dashboardData={dashboardData}
            defaultContent={
              <>
                {goalDisplay.length > 0 ? (
                  <VoortgangDoelenCard items={goalDisplay} totalActive={activeGoalCount} />
                ) : (
                  <DoelenEmptyState />
                )}
                <VrijheidStrip
                  freedomPct={freedomPct ?? null}
                  currentAge={currentAge ?? null}
                  fireAge={fireAge ?? null}
                  framing={freedomFraming}
                />
              </>
            }
          />
        ) : (
          <>
            {goalDisplay.length > 0 ? (
              <VoortgangDoelenCard items={goalDisplay} />
            ) : (
              <DoelenEmptyState />
            )}
            <VrijheidStrip
              freedomPct={freedomPct ?? null}
              currentAge={currentAge ?? null}
              fireAge={fireAge ?? null}
              framing={freedomFraming}
            />
          </>
        )}
      </div>
      )}

      {/* T-4 Dramatic Compound — alleen voor cash-zware users. */}
      {liquidCash != null && liquidCash >= 10_000 && (
        <div className="mt-6">
          <CompoundInsightCard liquidCash={liquidCash} />
        </div>
      )}

      <BriefingPanel
        entries={briefingEntries ?? []}
        refreshedAt={briefingRefreshedAt ?? null}
        canRefresh={briefingCanRefresh ?? false}
        freedomHero={freedomHero ?? null}
        headline={briefingHeadline ?? null}
        weekHistory={briefingWeekHistory}
        simpleMode={simple}
      />

      {/* Drie "alles bekijken"-ingangen onder de briefing. */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 print:hidden">
        <Link
          href="/overzicht/tips"
          className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline"
        >
          Alle tips & acties
          <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </Link>
        <Link
          href="/berichten"
          className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline"
        >
          Alle meldingen & berichten
          <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </Link>
        <Link
          href="/nieuws"
          className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline"
        >
          Bekijk het nieuws
          <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </Link>
      </div>

      {health && (
        <BottomSheet
          open={receiptOpen}
          onClose={() => setReceiptOpen(false)}
          title="Financiële gezondheid"
          size="lg"
        >
          <HealthScoreReceipt health={health} />
        </BottomSheet>
      )}

      {/* Filosofie-tagline als hero-footer — visueel afsluitend na sheet-mount. */}
      <p className="mt-6 pb-4 text-center text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)] font-medium">
        Geld is opgeslagen tijd
      </p>
    </>
  )
}

/**
 * OverzichtSecondaryFallback — stabiele-hoogte skeleton die het gestreamde blok
 * afdekt zolang `loadDashboardData` (+ will/briefing/snapshot) nog loopt. Reserveert
 * de hoogte van de hero-row (Health + grafiek) + rail + briefing zodat de instroom
 * van het echte blok geen layout-shift geeft (CLS blijft ~0; fase 1 bracht 'm naar
 * 0,00). Zuiver decoratief → `aria-hidden`.
 */
export function OverzichtSecondaryFallback() {
  return (
    <div aria-hidden="true" className="animate-pulse">
      {/* Hero-row: Health-card (1/4) + grafiek (3/4). */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 sm:gap-4 items-stretch">
        <div className="lg:col-span-1">
          <div className="h-48 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper-2)]" />
        </div>
        <div className="lg:col-span-3">
          <div className="h-48 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper-2)]" />
        </div>
      </div>
      {/* Rail-blok (Voortgang + Vrijheid). */}
      <div className="mt-3 sm:mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div className="h-32 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper-2)]" />
        <div className="h-32 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper-2)]" />
      </div>
      {/* Briefing-panel. */}
      <div className="mt-6 h-64 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper-2)]" />
    </div>
  )
}
