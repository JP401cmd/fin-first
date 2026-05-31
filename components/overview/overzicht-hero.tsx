'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { PageInfoButton } from '@/components/editorial'
import { PAGE_INFO } from '@/lib/page-info-content'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { HealthScoreReceipt } from '@/components/app/horizon/health-score-receipt'
import type { HealthScore } from '@/lib/financial-health'
import type { GoalWithBudget } from '@/lib/will-data-loader'
import type { DashboardData } from '@/components/widgets/widget-renderer'
import type { WidgetPref } from '@/lib/widget-catalog'
import { HefbomenNav } from './overzicht-hero/hefbomen-nav'
import { BriefingPanel, type BriefingEntry } from './briefing-panel'
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
import type { HefbomenTotals } from './overzicht-hero/hefbomen-nav'
import {
  HeroEditToggle,
  HeroWidgetRail,
  useHeroRailState,
} from './hero-widget-rail'
import { ViewModeToggle, useViewMode } from '@/components/app/view-mode-provider'
import { OnboardingNudges } from './onboarding-nudges'
import { CompoundInsightCard } from './compound-insight-card'
import { PrintOverzichtButton } from './print-overzicht-button'

type OverzichtHeroProps = {
  userName?: string
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
  /** Optionele totaalbedragen per hefboom (bezittingen, schulden, etc.). */
  totals?: HefbomenTotals
  /** Briefing-entries onder de hero (max 6, 3-koloms grid). Wanneer leeg
   *  toont het panel een placeholder-card. Categorieën: observation /
   *  tip / upcoming / heads_up / milestone / market. */
  briefingEntries?: BriefingEntry[]
  /** ISO-tijdstip waarop de briefing voor vandaag is vastgezet ("Bijgewerkt …"). */
  briefingRefreshedAt?: string | null
  /** Of de handmatige ververs vandaag nog beschikbaar is (max 1×/dag). */
  briefingCanRefresh?: boolean
  /** Vrijheidstijd-hero bovenaan de briefing (week-over-week delta). */
  freedomHero?: FreedomHeroProps | null
  /** Eén-zin kop boven de briefjes. */
  briefingHeadline?: string | null
  /** Inputs voor mini-vermogen-grafiek naast Health Score. Wanneer leeg
   *  blijft chart-slot leeg (geen rendering). */
  netWorthHistory?: { month: string; value: number }[]
  currentNetWorth?: number | null
  fireAge?: number | null
  /** Per-jaar projectie uit `runUnifiedProjection` — zelfde bron als
   *  /toekomst zodat curves overeenkomen. */
  simRows?: { age: number; endPortfolio: number }[] | null
  /** Heeft de user een geboortejaar gezet? Voor onboarding-nudges. */
  hasDob?: boolean
  /** Heeft de user minimaal 1 actief asset of bank-account? */
  hasAssets?: boolean
  /** Heeft de user minimaal 1 doel? */
  hasGoals?: boolean
  /** Dagen sinds account-aanmaak — voor de briefing-nudge (≥ 7d trigger). */
  accountAgeDays?: number
  /** Liquide cash op spaarrekeningen — voor compound-insight reveal. */
  liquidCash?: number
  /** Doelbedrag bij vrijheid uit de simulatie — toont op de chart als
   *  eindwaarde naast de Vrijheid-marker. */
  simRequiredPortfolio?: number | null
  /** Volledige DashboardData voor de optionele HeroWidgetRail (power-user
   *  edit-mode). Wanneer afwezig: edit-toggle wordt niet getoond. */
  dashboardData?: DashboardData
  /** Active + all widget-prefs voor de hero-rail. Aanwezig wanneer
   *  dashboardData ook aanwezig is — de DraggableWidgetGrid heeft ze
   *  allebei nodig. */
  activeWidgets?: WidgetPref[]
  allWidgetPrefs?: WidgetPref[]
}

function formatDateNL(): string {
  const formatter = new Intl.DateTimeFormat('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const parts = formatter.format(new Date())
  return parts.charAt(0).toUpperCase() + parts.slice(1)
}

function greetingByHour(): string {
  const h = new Date().getHours()
  if (h < 6) return 'Goedenacht'
  if (h < 12) return 'Goedemorgen'
  if (h < 18) return 'Goedemiddag'
  return 'Goedenavond'
}

/**
 * OverzichtHero — visuele hero op /overzicht (Tier-2 #4 + #8).
 *
 * Orchestreert: begroeting + datum, vier-hefbomen-tegels, Health Score-card
 * (of empty-state), Voortgang-doelen-card (of empty-state), Vrijheid-strip
 * en Mini-tijdslijn naar vrijheidsmoment. Sub-componenten leven in
 * `./overzicht-hero/`. Drill-down via BottomSheet (kassabon met pillars).
 *
 * Komt bovenop de bestaande WillLanding-content — geen vervanging.
 */
export function OverzichtHero({
  userName,
  health,
  goals,
  goalProgresses,
  freedomPct,
  currentAge,
  endAge,
  isPensioenMode,
  totals,
  briefingEntries,
  briefingRefreshedAt,
  briefingCanRefresh,
  freedomHero,
  briefingHeadline,
  netWorthHistory,
  currentNetWorth,
  fireAge,
  simRows,
  simRequiredPortfolio,
  dashboardData,
  activeWidgets,
  allWidgetPrefs,
  hasDob,
  hasAssets,
  hasGoals,
  accountAgeDays,
  liquidCash,
}: OverzichtHeroProps) {
  const [receiptOpen, setReceiptOpen] = useState(false)
  const rail = useHeroRailState(activeWidgets ?? [])
  // Plannen-modus exposeert power-user-tools (Bewerken-toggle).
  // Kijken-modus toont alleen content, geen edit-acties (plan A-5).
  const { isPlannen } = useViewMode()

  // Memoize once per mount — datum + groet wisselen zelden tijdens een
  // sessie. Voorkomt onnodige Intl-formatter-instances bij elke re-render.
  const dateLabel = useMemo(() => formatDateNL(), [])
  const greeting = useMemo(() => greetingByHour(), [])

  // Defensief: log dev-warning bij mismatch tussen goals + progresses-arrays.
  // Caller zou ze altijd parallel moeten leveren; mismatch wijst op een
  // loader-bug die anders silent gewone goals zou laten doorvallen.
  if (
    process.env.NODE_ENV !== 'production' &&
    goals &&
    goalProgresses &&
    goalProgresses.length > goals.length
  ) {
    console.warn(
      `[OverzichtHero] goalProgresses.length (${goalProgresses.length}) > ` +
        `goals.length (${goals.length}). Extra progresses worden genegeerd.`,
    )
  }

  // Bouw doelen-display: koppel goals met hun progress op index, sorteer
  // achterop-achter doelen eerst, skip voltooide. Type-guard predicate
  // narrowt zodat we daarna geen non-null assertions nodig hebben.
  const goalDisplay = (goals ?? [])
    .map((g, i) => ({ goal: g, progress: goalProgresses?.[i] ?? null }))
    .filter(
      (g): g is { goal: GoalWithBudget; progress: GoalProgress } =>
        g.progress != null && g.progress.pct < 100,
    )
    .sort((a, b) => Number(!a.progress.onTrack) - Number(!b.progress.onTrack))
    .slice(0, 3)

  return (
    <section className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-6 pb-2 md:pt-8 md:pb-4">
      <div className="absolute right-4 top-6 sm:right-6 sm:top-8 flex items-center gap-2">
        <ViewModeToggle />
        {dashboardData && isPlannen && (
          <HeroEditToggle
            isEditing={rail.isEditing}
            onToggle={() => rail.setIsEditing(!rail.isEditing)}
          />
        )}
        <PrintOverzichtButton />
        <PageInfoButton description={PAGE_INFO['/overzicht'] ?? ''} />
      </div>

      <header className="mb-6 pr-12 sm:pr-16">
        <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-4)]">
          {dateLabel}
        </div>
        <h1 className="mt-1 font-serif text-2xl md:text-3xl font-semibold text-[var(--ink)] leading-tight">
          {greeting}
          {userName ? `, ${userName}` : ''}
        </h1>
        {goalDisplay.length > 0 && (
          <p className="mt-2 text-sm sm:text-base text-[var(--ink-2)]">
            <strong className="font-semibold text-[var(--ink)]">
              {goalDisplay.length}
            </strong>{' '}
            {goalDisplay.length === 1 ? 'actief doel' : 'actieve doelen'} — kijk
            hoever je bent.
          </p>
        )}
      </header>

      {(hasDob !== undefined || hasAssets !== undefined || hasGoals !== undefined) && (
        <OnboardingNudges
          hasDob={hasDob ?? false}
          hasAssets={hasAssets ?? false}
          hasGoals={hasGoals ?? false}
          accountAgeDays={accountAgeDays ?? 0}
        />
      )}

      <HefbomenNav health={health} totals={totals} />

      {/* Hero-row: Health Score smaller (1/4) + chart breder (3/4), beide
          even hoog via items-stretch + h-full op de cards. Op smaller
          breakpoints stacken ze full-width. Legenda verwijderd — dots
          op de tegels zelf zijn zelf-uitleggend. */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 sm:gap-4 items-stretch">
        <div className="lg:col-span-1">
          {health ? (
            <HealthScoreCard health={health} onOpenReceipt={() => setReceiptOpen(true)} />
          ) : (
            <HealthScoreEmptyState />
          )}
        </div>
        <div className="lg:col-span-3">
          <MiniNetWorthChart
            netWorthHistory={netWorthHistory ?? []}
            currentNetWorth={currentNetWorth ?? 0}
            currentAge={currentAge ?? null}
            fireAge={fireAge ?? null}
            endAge={endAge ?? null}
            isPensioenMode={isPensioenMode ?? false}
            simRows={simRows ?? null}
            simRequiredPortfolio={simRequiredPortfolio ?? null}
          />
        </div>
      </div>

      {/* Optionele power-user widget-rail OP DEZELFDE PLEK als Voortgang-
          doelen + Vrijheidsstrip. Default (geen edit-mode, geen config):
          render gewoon de defaults. Edit-mode of met config: 4-slot grid
          met widgets uit WIDGET_CATALOG. State leeft in localStorage. */}
      <div className="mt-3 sm:mt-4">
        {dashboardData && activeWidgets && allWidgetPrefs ? (
          <HeroWidgetRail
            // Edit-mode forceren naar false in Kijken — voorkomt dat user
            // vast komt te zitten in edit-mode na mode-switch (plan A-5).
            isEditing={isPlannen && rail.isEditing}
            onEditModeChange={rail.setIsEditing}
            hasActiveWidgets={rail.hasActiveWidgets}
            activeWidgets={activeWidgets}
            allPrefs={allWidgetPrefs}
            dashboardData={dashboardData}
            defaultContent={
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
                />
          </>
        )}
      </div>

      {/* T-4 Dramatic Compound — alleen voor cash-zware users zodat
          we niet alle gebruikers met irrelevante content lastig vallen.
          Drempel €10k; component zelf rendert nog een 2e check op
          hasDramaticDelta. */}
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
      />

      <div className="mt-4 text-center print:hidden">
        <Link
          href="/overzicht/tips"
          className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline"
        >
          Alle tips & acties
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
    </section>
  )
}
