'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { PageInfoButton } from '@/components/editorial'
import { PAGE_INFO } from '@/lib/page-info-content'
import type { GoalWithBudget } from '@/lib/fin-data-loader'
import type { DashboardData } from '@/components/widgets/widget-renderer'
import type { WidgetPref } from '@/lib/widget-catalog'
import { BriefingPanel, type BriefingEntry, type BriefingWeekHistoryItem } from './briefing-panel'
import type { FreedomHeroProps } from '@/lib/briefing/overview-briefing'
import { DoelenEmptyState } from './overzicht-hero/empty-states'
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

/**
 * OverzichtSecondary — het GESTREAMDE blok ONDER de hero-row van /overzicht.
 * Alles wat op de zware `loadDashboardData` (+ will/aandachtspunten/briefing/
 * snapshot) wacht en NIET los geladen wordt, leeft hier: de widget-rail
 * (Voortgang + Vrijheid of power-user-widgets), de compound-insight en het
 * briefing-panel — plus de utility-controls (bewerken/print/status-dot/`i`) die
 * rechtsboven over de hero zweven.
 *
 * De Health-Score-card rendert nu DIRECT in blok 1 (`OverzichtHeroPrimary`,
 * los van deze databundel) en de mini-vermogen-grafiek stroomt in een eigen
 * `<Suspense>`-cel (`OverzichtNetWorthChartLoader`) — zie de perf-kaart
 * "gezondheid & netto vermogen los laden van widgets". Blok 1 (begroeting +
 * vier-hefbomen-kompas + Health-card) rendert zónder op deze data te wachten;
 * dit blok komt er onder een `<Suspense>` achteraan gestroomd. De props zijn
 * puur consume-only afgeleiden uit de loaders — hier wordt niets herberekend.
 */
export type OverzichtSecondaryProps = {
  goals?: GoalWithBudget[]
  goalProgresses?: GoalProgress[]
  /** Percentage op weg naar financiële vrijheid (0-100). Uit healthScoreInput. Voor de Vrijheid-strip. */
  freedomPct?: number | null
  /** Huidige leeftijd (afgerond) — null bij ontbrekende DOB. Voor de Vrijheid-strip. */
  currentAge?: number | null
  /** Vrijheidsleeftijd (afgerond) uit de sim — voor de Vrijheid-strip. */
  fireAge?: number | null
  /**
   * Afgeleide vrijheids-/pensioenframing uit de gedeelde, consume-only vlag
   * (`resolveFreedomFraming`). Stuurt de Vrijheid-strip. Default 'building'.
   */
  freedomFraming?: FreedomFraming
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
  /**
   * Startpositie van het rouleer-venster in de Eenvoudige weergave (server-prop
   * uit de rotatiecookie). Zie lib/briefing/rotation.ts.
   */
  briefingRotation?: number
  /** Liquide cash op spaarrekeningen — voor compound-insight reveal. */
  liquidCash?: number
  /**
   * Volledige DashboardData voor de optionele HeroWidgetRail (power-user
   * edit-mode). De widget-gated velden in de bundel zijn leeg voor een
   * minimaal-widget-account → kleinere RSC-flight; de rail toont alleen ACTIEVE
   * widgets, die per definitie hun data hebben.
   */
  dashboardData?: DashboardData
  /** Active + all widget-prefs voor de hero-rail. */
  activeWidgets?: WidgetPref[]
  allWidgetPrefs?: WidgetPref[]
}

export function OverzichtSecondary({
  goals,
  goalProgresses,
  freedomPct,
  currentAge,
  fireAge,
  freedomFraming = 'building',
  briefingEntries,
  briefingRefreshedAt,
  // briefingDataChanged wordt (net als vóór deze kaart) niet doorgegeven aan
  // BriefingPanel — bewust ongemoeid gelaten; buiten scope van deze perf-kaart.
  briefingCanRefresh,
  freedomHero,
  briefingHeadline,
  briefingWeekHistory,
  briefingRotation = 0,
  dashboardData,
  activeWidgets,
  allWidgetPrefs,
  liquidCash,
}: OverzichtSecondaryProps) {
  const rail = useHeroRailState(activeWidgets ?? [])

  // SINGLE SOURCE OF TRUTH voor de weergavemodus: één read van useDisplayMode().
  // `simple` versobert /overzicht identiek aan de rest van de hero.
  const { mode } = useDisplayMode()
  const simple = mode === 'simple'

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
        rotationOffset={briefingRotation}
      />

      {/* Drie "alles bekijken"-ingangen onder de briefing. In Eenvoudig weg
          (OVZ-3): de navigatie draagt deze drie bestemmingen al, en onderaan de
          eerste pagina is een tweede linkenrij precies de drukte die de
          eenvoudige weergave hoort weg te nemen. */}
      {!simple && (
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
      )}

      {/* Filosofie-tagline als hero-footer — visueel afsluitend. */}
      <p className="mt-6 pb-4 text-center text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)] font-medium">
        Geld is opgeslagen tijd
      </p>
    </>
  )
}

/**
 * MiniNetWorthChartFallback — stabiele-hoogte skeleton voor de rechter hero-row-
 * cel (3/4) zolang `OverzichtNetWorthChartLoader` (kernel-sim) nog stroomt. Vult
 * de volledige celhoogte (`h-full`) zodat de Health-card links (die al gepaint
 * is) de rij-hoogte bepaalt en er geen layout-shift optreedt. Zuiver decoratief.
 */
export function MiniNetWorthChartFallback() {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse h-full min-h-48 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper-2)]"
    />
  )
}

/**
 * OverzichtSecondaryFallback — stabiele-hoogte skeleton die het blok ONDER de
 * hero-row afdekt zolang `loadDashboardData` (+ will/briefing/snapshot) nog
 * loopt. Reserveert de hoogte van de widget-rail + briefing zodat de instroom
 * van het echte blok geen layout-shift geeft (CLS blijft ~0). De Health-card en
 * de vermogensgrafiek zitten NIET meer in deze fallback: de card rendert direct
 * in blok 1 en de grafiek heeft z'n eigen `MiniNetWorthChartFallback`. Zuiver
 * decoratief → `aria-hidden`.
 */
export function OverzichtSecondaryFallback() {
  return (
    <div aria-hidden="true" className="animate-pulse">
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
