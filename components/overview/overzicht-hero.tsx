'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { EditorialHeadline, Kicker, PageInfoButton } from '@/components/editorial'
import { PAGE_INFO } from '@/lib/page-info-content'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { SectionDivider } from '@/components/app/section-divider'
import { HealthScoreReceipt } from '@/components/app/horizon/health-score-receipt'
import type { HealthScore } from '@/lib/financial-health'
import type { GoalWithBudget } from '@/lib/will-data-loader'
import type { DashboardData } from '@/components/widgets/widget-renderer'
import type { WidgetPref } from '@/lib/widget-catalog'
import { HefbomenNav, type HefbomenHousingSplit } from './overzicht-hero/hefbomen-nav'
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
import type { HefbomenTotals } from './overzicht-hero/hefbomen-nav'
import type { LeverScores } from '@/components/app/shell/lever-scores'
import {
  HeroEditToggle,
  HeroWidgetRail,
  useHeroRailState,
} from './hero-widget-rail'
import { PerspectiveContextLabel } from '@/components/app/perspective-context-label'
import { CompoundInsightCard } from './compound-insight-card'
import { PrintOverzichtButton } from './print-overzicht-button'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'

// Stabiele lege-array-referentie voor de mini-vermogen-grafiek. Voorkomt dat
// `netWorthHistory ?? []` bij ontbrekende historie elke render een verse
// array-ref maakt — die zou de memo op MiniNetWorthChart telkens breken.
const EMPTY_NET_WORTH_HISTORY: { month: string; value: number }[] = []

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
  /**
   * Afgeleide vrijheids-/pensioenframing uit de gedeelde, consume-only vlag
   * (`resolveFreedomFraming`). Stuurt de Vrijheid-strip: 'building' (% op weg),
   * 'free' (al vrij) of 'pensioen' (met pensioen). Default 'building'.
   */
  freedomFraming?: FreedomFraming
  /** Optionele totaalbedragen per hefboom (bezittingen, schulden, etc.). */
  totals?: HefbomenTotals
  /**
   * Dubbele grondslag incl./excl. eigen woning — bron = `horizonData`
   * (perspectief-correct), niet `dashboardData`. Aanwezig (non-null) ⇔
   * `horizonData.showDualHousingBasis`. Voedt de "excl. eigen woning"-subregel
   * op de bezittingen-/schulden-hefboom én (via `netWorthExclHome`) de
   * subtotaal-regel onder het nettovermogen-kopgetal. Null → geen splitsing.
   */
  housingSplit?: HefbomenHousingSplit | null
  /** Nettovermogen excl. eigen woning (`horizonData.netWorthExclHome`) — losse
   *  regel onder het kopgetal van de vermogensgrafiek. Niet zelf herrekenen. */
  netWorthExclHome?: number | null
  /**
   * Vier-hefbomen-kompas-scores uit `loadLeverScores` (gedeelde SSoT). Voedt de
   * status-dots op de hefboomkaarten, identiek aan de sidebar-dots en de
   * status-duiding-banner. Null → kaarten vallen terug op de pijler-status.
   */
  leverScores?: LeverScores | null
  /** Briefing-entries onder de hero (max 6, 3-koloms grid). Wanneer leeg
   *  toont het panel een placeholder-card. Categorieën: observation /
   *  tip / upcoming / heads_up / milestone / market. */
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
  /** Inputs voor mini-vermogen-grafiek naast Health Score. Wanneer leeg
   *  blijft chart-slot leeg (geen rendering). */
  netWorthHistory?: { month: string; value: number }[]
  currentNetWorth?: number | null
  fireAge?: number | null
  /** Per-jaar geprojecteerd VOLLEDIG netto vermogen (FIRE-pot + niet-liquide
   *  assets) uit de loader — zodat de curve continu doorloopt vanuit het
   *  Vandaag-punt zonder dip op huis-filterende housing-modi. */
  simNetWorthRows?: { age: number; netWorth: number }[] | null
  /** Geschat maandelijks spaarritme — back-cast voor ontbrekende
   *  historie-maanden in de mini-vermogen-grafiek. */
  monthlySavings?: number | null
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
  freedomFraming = 'building',
  totals,
  housingSplit = null,
  netWorthExclHome,
  leverScores,
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
}: OverzichtHeroProps) {
  const [receiptOpen, setReceiptOpen] = useState(false)
  const rail = useHeroRailState(activeWidgets ?? [])

  // SINGLE SOURCE OF TRUTH voor de weergavemodus: één read van useDisplayMode().
  // `simple` wordt als afgeleide boolean doorgegeven aan de sub-componenten —
  // er is bewust géén tweede leespad (geen eigen state, geen localStorage). In
  // Eenvoudig versobert /overzicht: geen widgets-bewerken, geen kaart-chevrons,
  // health alleen getal+cirkel, geen voortgang-/vrijheidsblok, geen
  // "vrijheid deze week", en één briefje over de volle breedte.
  const { mode } = useDisplayMode()
  const simple = mode === 'simple'

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

  // Telling + doelen-display in één memo op [goals, goalProgresses]. Een verse
  // `goalDisplay`-array bij elke render zou de memo op VoortgangDoelenCard
  // breken; deze memo houdt de referentie stabiel zolang de bron-props gelijk
  // blijven.
  //  - activeGoalCount: telling die we REFEREREN — moet exact gelijk zijn aan
  //    /toekomst/doelen. DoelenView telt alle doelen met progress (loader
  //    filtert al op niet-voltooid + capt op 5). De cap van 3 hieronder geldt
  //    ALLEEN voor de getoonde kaarten, niet voor dit getal; anders zou
  //    /overzicht "3" tonen terwijl de Doelen-pagina er "4" laat zien.
  //  - goalDisplay: koppel goals met hun progress op index, sorteer achterop-
  //    achter doelen eerst, skip voltooide. Type-guard predicate narrowt zodat
  //    we daarna geen non-null assertions nodig hebben. Gecapt op de 3
  //    belangrijkste kaarten — activeGoalCount blijft het wáre totaal.
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
    <section className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-6 pb-2 md:pt-8 md:pb-4">
      <div className="absolute right-4 top-6 sm:right-6 sm:top-8 flex items-center gap-2">
        {dashboardData && !simple && (
          <HeroEditToggle
            isEditing={rail.isEditing}
            onToggle={() => rail.setIsEditing(!rail.isEditing)}
          />
        )}
        <PrintOverzichtButton />
        {/* Geminimaliseerde status-/vrijheidsmelding: gekleurd statuspunt direct
            links van de 'i' (meldingen-conventie). Rendert alleen wanneer de
            PageStatusProvider 'minimized' meldt. */}
        <PageStatusDot />
        <PageInfoButton description={PAGE_INFO['/overzicht'] ?? ''} />
      </div>

      <header className="mb-6 pr-12 sm:pr-16">
        <div className="flex flex-wrap items-center gap-2">
          <Kicker size="large">{dateLabel}</Kicker>
          {/* Maakt duidelijk wanneer de getallen van het huishouden/partner zijn
              (verborgen in eigen weergave). */}
          <PerspectiveContextLabel />
        </div>
        <EditorialHeadline
          level="h1"
          size="sm"
          emphasis={userName || undefined}
          className="mt-1 text-[var(--ink)]"
        >
          {`${greeting}${userName ? `, ${userName}` : ''}`}
        </EditorialHeadline>
      </header>

      <HefbomenNav
        health={health}
        leverScores={leverScores}
        totals={totals}
        housingSplit={housingSplit}
        simple={simple}
      />

      {/* Subtiele editorial scheiding tussen de hefbomen-rij en de
          health/chart-rij. `!my-5` tempert de standaard `my-8` van de
          divider — het hero-ritme blijft compact. */}
      <SectionDivider className="!my-5" />

      {/* Hero-row: Health Score smaller (1/4) + chart breder (3/4), beide
          even hoog via items-stretch + h-full op de cards. Op smaller
          breakpoints stacken ze full-width. Legenda verwijderd — dots
          op de tegels zelf zijn zelf-uitleggend. */}
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
            />
          </div>
        </div>
      </div>

      {/* Optionele power-user widget-rail OP DEZELFDE PLEK als Voortgang-
          doelen + Vrijheidsstrip. Default (geen edit-mode, geen config):
          render gewoon de defaults. Edit-mode of met config: 4-slot grid
          met widgets uit WIDGET_CATALOG. State leeft in localStorage.
          In Eenvoudig verbergen we dit hele blok — of het nu de voortgang-/
          vrijheidsdefaults toont of actieve widgets (user-keuze in Notities). */}
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
        weekHistory={briefingWeekHistory}
        simpleMode={simple}
      />

      {/* Drie "alles bekijken"-ingangen onder de briefing: de tips & acties-
          stroom, het berichtencentrum (alle meldingen) en de financiële krant.
          Wrapt op smalle schermen zodat alle drie leesbaar blijven. */}
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
    </section>
  )
}
