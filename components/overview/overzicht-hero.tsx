'use client'

import type { ReactNode } from 'react'
import { EditorialHeadline, Kicker } from '@/components/editorial'
import { SectionDivider } from '@/components/app/section-divider'
import type { HealthScore } from '@/lib/financial-health'
import {
  HefbomenNav,
  type HefbomenHousingSplit,
  type HefbomenTotals,
} from './overzicht-hero/hefbomen-nav'
import type { LeverScores } from '@/components/app/shell/lever-scores'
import { PerspectiveContextLabel } from '@/components/app/perspective-context-label'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'

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
   * Het GESTREAMDE tweede blok (`<Suspense>` rond `OverzichtSecondaryLoader`).
   * Alles wat op `loadDashboardData` (+ will/briefing/snapshot) wacht — de
   * Health-card, mini-vermogen-grafiek, widget-rail, briefing en de
   * utility-controls — komt hierlangs binnen, ná de eerste paint van dit blok.
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
  health,
  leverScores,
  totals,
  housingSplit = null,
  secondary,
}: OverzichtHeroPrimaryProps) {
  // SINGLE SOURCE OF TRUTH voor de weergavemodus: één read van useDisplayMode().
  // In Eenvoudig versobert het hefbomen-kompas (geen kaart-chevrons, minder
  // sub-tekst) — identiek aan het gestreamde blok, dat 'simple' zelf leest.
  const { mode } = useDisplayMode()
  const simple = mode === 'simple'

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

      {/* Subtiele editorial scheiding tussen de hefbomen-rij en het gestreamde
          health/chart/briefing-blok. `!my-5` tempert de standaard `my-8`. */}
      <SectionDivider className="!my-5" />

      {secondary}
    </section>
  )
}
