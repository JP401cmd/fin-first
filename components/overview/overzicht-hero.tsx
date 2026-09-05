'use client'

import { useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { EditorialHeadline, Kicker } from '@/components/editorial'
import { SectionDivider } from '@/components/app/section-divider'
import { BottomSheet } from '@/components/app/bottom-sheet'
import type { HealthScore } from '@/lib/financial-health'
import {
  HefbomenNav,
  type HefbomenHousingSplit,
  type HefbomenTotals,
} from './overzicht-hero/hefbomen-nav'
import { HealthScoreCard } from './overzicht-hero/health-score-card'
import { HealthScoreEmptyState } from './overzicht-hero/empty-states'
import type { LeverScores } from '@/components/app/shell/lever-scores'
import { PerspectiveContextLabel } from '@/components/app/perspective-context-label'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'

// HealthScoreReceipt (zwaar, ~1011 r) blijft lazy — hij zit alleen in de
// BottomSheet die pas ná een klik op de Health-card opent, dus buiten het
// first-load client-JS-chunk van /overzicht (perf Task 3.2). `ssr:false` +
// `loading:null`: de sheet mount pas na de klik, een skeleton zou één frame
// flitsen.
const HealthScoreReceipt = dynamic(
  () =>
    import('@/components/app/horizon/health-score-receipt').then((m) => ({
      default: m.HealthScoreReceipt,
    })),
  { ssr: false, loading: () => null },
)

type OverzichtHeroPrimaryProps = {
  userName?: string
  /**
   * Tijd-van-de-dag-groet ("Goedemorgen" …), server-side berekend in
   * Europe/Amsterdam (`resolveOverviewGreeting`) en als prop doorgegeven zodat
   * SSR en de eerste client-render exact gelijk zijn (geen React #418
   * hydration-mismatch).
   */
  greeting: string
  /** NL-datumlabel ("Donderdag 16 juli 2026"), zelfde server-bron als `greeting`. */
  dateLabel: string
  /**
   * Bijschrift direct ONDER de begroeting, bínnen de `<header>` (H11): de
   * "sinds je vorige bezoek"-delta-regel, gestreamd achter een eigen
   * `<Suspense>`. Hoort in de header omdat hij bij de groet leest ("goedemorgen
   * … sinds gisteren kwam er 3 dagen vrijheid bij") en dezelfde
   * `pr-12 sm:pr-16`-vrijloop voor de utility-cluster moet respecteren. Rendert
   * `null` zodra er niets te melden valt.
   */
  greetingNote?: ReactNode
  /**
   * Bannerstrook NÁ de begroeting en vóór het hefbomen-kompas (H20): de
   * welkomstgids en de maand-check-in. Die stonden bóven de begroeting, waardoor
   * je op een vers account eerst een checklist zag en pas daarna wie je bent en
   * hoe je ervoor staat. Eigen slot (geen deel van `greetingNote`) omdat het
   * volle-breedte kaarten zijn: in de header zouden ze de rechter vrijloop voor
   * de utility-cluster erven en scheef uitlijnen.
   */
  banners?: ReactNode
  /** Health Score — voedt de status-fallback op de hefboomtegels. Uit horizonData. */
  health: HealthScore | null
  /**
   * Vier-hefbomen-kompas-scores uit `loadLeverScores` (gedeelde SSoT). Voedt de
   * status-dots op de hefboomkaarten, identiek aan de sidebar-dots en de
   * status-duiding-banner.
   */
  leverScores?: LeverScores | null
  /** Totaalbedragen per hefboom (bezittingen/schulden/cashflow/belasting). Uit horizonData. */
  totals?: HefbomenTotals
  /** Dubbele grondslag incl./excl. eigen woning — bron = horizonData. Null → geen splitsing. */
  housingSplit?: HefbomenHousingSplit | null
  /**
   * De rechter cel (3/4) van de hero-row: de mini-vermogen-grafiek, GESTREAMD
   * achter een eigen `<Suspense>` (`OverzichtNetWorthChartLoader`) omdat de
   * per-jaar-projectie de kernel-sim uit `loadDashboardData` nodig heeft. De
   * Health-card links (1/4) rendert wél direct uit de blok-1-`health` — zo komt
   * gezondheid meteen in beeld, los van de widget-zware databundel (kaart
   * "gezondheid & netto vermogen los laden van widgets").
   */
  heroChart: ReactNode
  /**
   * Het GESTREAMDE tweede blok (`<Suspense>` rond `OverzichtSecondaryLoader`).
   * Alles wat verder op `loadDashboardData` (+ will/briefing/snapshot) wacht —
   * de widget-rail, briefing en de utility-controls — komt hierlangs binnen, ná
   * de eerste paint van dit blok.
   */
  secondary: ReactNode
}

/**
 * OverzichtHeroPrimary — het EERSTE, direct-renderende blok van /overzicht
 * (perf Task 2.4). Toont de begroeting + het vier-hefbomen-kompas (met
 * status-dots uit `loadLeverScores` en de €-totalen uit `loadHorizonData`) —
 * de "hoe sta je ervoor"-oogopslag. Het hangt UITSLUITEND van de lichte,
 * `cache()`-gedeelde blok-1-loaders af (lever-scores + horizon), niet van de
 * zware `loadDashboardData`. Het tweede blok (`secondary`) stroomt er onder een
 * `<Suspense>` achteraan.
 *
 * De begroeting houdt rechts `pr-12 sm:pr-16` vrij voor de utility-cluster die
 * het gestreamde blok rechtsboven over de hero plaatst — zo is er geen
 * layout-shift wanneer die instroomt (CLS blijft ~0).
 */
export function OverzichtHeroPrimary({
  userName,
  greeting,
  dateLabel,
  greetingNote,
  banners,
  health,
  leverScores,
  totals,
  housingSplit = null,
  heroChart,
  secondary,
}: OverzichtHeroPrimaryProps) {
  // SINGLE SOURCE OF TRUTH voor de weergavemodus: één read van useDisplayMode().
  // In Eenvoudig versobert het hefbomen-kompas (geen kaart-chevrons, minder
  // sub-tekst) — identiek aan het gestreamde blok, dat 'simple' zelf leest.
  const { mode } = useDisplayMode()
  const simple = mode === 'simple'

  // Health-Score-receipt (deep-dive-BottomSheet) — opent pas na een klik op de
  // Health-card. De card + sheet leven nu in blok 1 zodat gezondheid direct
  // paint, i.p.v. mee te stromen met de widget-zware databundel.
  const [receiptOpen, setReceiptOpen] = useState(false)

  // `dateLabel` + `greeting` komen als props binnen (server-side berekend in
  // Europe/Amsterdam) — één bron van waarheid voor de tijd, zodat SSR en de
  // eerste client-render identiek zijn (geen hydration-mismatch #418).

  return (
    <section className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-6 pb-2 md:pt-8 md:pb-4">
      <header className="mb-6 pr-12 sm:pr-16">
        <div className="flex flex-wrap items-center gap-2">
          <Kicker size="large">{dateLabel}</Kicker>
          {/* Maakt duidelijk wanneer de getallen van het huishouden/partner zijn. */}
          <PerspectiveContextLabel />
        </div>
        <EditorialHeadline
          level="h2"
          size="sm"
          emphasis={userName || undefined}
          className="mt-1 text-[var(--ink)]"
        >
          {`${greeting}${userName ? `, ${userName}` : ''}`}
        </EditorialHeadline>
        {greetingNote}
      </header>

      {/* H20 — gids/check-in ná de begroeting. Bewust hier en niet ná het
          hefbomen-kompas: het kompas is de eerste inhoudelijke rij van de hero,
          en een banner daartussen zou het blok in tweeën knippen. */}
      {banners}

      <HefbomenNav
        health={health}
        leverScores={leverScores}
        totals={totals}
        housingSplit={housingSplit}
        simple={simple}
      />

      {/* Subtiele editorial scheiding tussen de hefbomen-rij en het
          health/chart/briefing-blok. `!my-5` tempert de standaard `my-8`. */}
      <SectionDivider className="!my-5" />

      {/* Hero-row: Health Score smaller (1/4) + vermogensgrafiek breder (3/4),
          beide even hoog via items-stretch + h-full op de cards. De Health-card
          rendert DIRECT uit de blok-1-`health` (los van de widget-databundel);
          de grafiek stroomt in de rechter cel achter een eigen `<Suspense>`. */}
      {/* De twee `data-tour`-ankers zitten op de GRID-CELLEN, niet op de kaarten
          erin: de linkercel wisselt tussen `HealthScoreCard` en een empty state,
          de rechter tussen een Suspense-fallback en de echte grafiek. Op de cel
          overleeft het anker beide wissels, dus de rondleiding wijst nooit naar
          een element dat net vervangen is (ADR 0130). */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 sm:gap-4 items-stretch">
        <div data-tour="gezondheid" className="lg:col-span-1">
          {health ? (
            <HealthScoreCard
              health={health}
              onOpenReceipt={() => setReceiptOpen(true)}
              simple={simple}
            />
          ) : (
            <HealthScoreEmptyState />
          )}
        </div>
        <div data-tour="grafiek" className="lg:col-span-3">
          <div className="h-full">{heroChart}</div>
        </div>
      </div>

      {secondary}

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
    </section>
  )
}
