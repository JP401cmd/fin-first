import type { Metadata } from 'next'
import { Suspense } from 'react'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { getOwnProfile } from '@/lib/server-data/base'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { OverzichtHeroPrimary } from '@/components/overview/overzicht-hero'
import {
  OverzichtSecondaryLoader,
  OverzichtNetWorthChartLoader,
} from '@/components/overview/overzicht-secondary-loader'
import {
  OverzichtSecondaryFallback,
  MiniNetWorthChartFallback,
} from '@/components/overview/overzicht-secondary'
import { resolveOverviewGreeting } from '@/lib/overview/greeting'
import { CheckinBanner } from '@/components/overview/checkin-banner'
import { WelcomeGuideBanner } from '@/components/overview/welcome-guide-banner'
import { ageAtDate } from '@/lib/horizon-data'
import { loadLeverScores } from '@/lib/lever-scores-loader'
import { loadCheckinBannerSeed, loadWelcomeGuideSeed } from '@/lib/overview/banner-seeds'

export const metadata: Metadata = {
  title: 'Overzicht — TriFinity',
  description: 'Hoe sta je er voor: vier-hefbomen-kompas, gezondheidsscore en briefing.',
}

/**
 * /overzicht — canonieke landing, gestreamd in blokken (perf Task 2.4 + de kaart
 * "gezondheid & netto vermogen los laden van widgets"):
 *
 *  Blok 1 (direct): de begroeting + het vier-hefbomen-kompas ÉN de
 *  Health-Score-card (`OverzichtHeroPrimary`). Hangt UITSLUITEND van de lichte,
 *  `cache()`-gedeelde blok-1-loaders af — `loadLeverScores` + `loadHorizonData`
 *  (health/vrijheid%/housing/leeftijd) + het profiel (naam) + de twee
 *  banner-seeds. Paint dus zónder op de zware `loadDashboardData` te wachten;
 *  gezondheid komt daardoor meteen in beeld, los van de widget-databundel.
 *
 *  `heroChart` (gestreamd, eigen `<Suspense>`): de mini-vermogen-grafiek
 *  (`OverzichtNetWorthChartLoader`). De per-jaar-PROJECTIE komt uit de
 *  kernel-zware `loadDashboardData` en kan niet mee naar blok 1; het HUIDIGE
 *  netto vermogen staat al perspectief-correct in het kompas van blok 1.
 *
 *  `secondary` (gestreamd, eigen `<Suspense>`): `OverzichtSecondaryLoader` doet
 *  `loadDashboardData` + will + markt-/check-in-briefing + de wekelijkse
 *  snapshot-write + de page-status-seed, en levert de widget-rail, compound en
 *  briefing. Elke Suspense-fallback reserveert een stabiele hoogte (skeleton)
 *  zodat de instroom geen layout-shift geeft (CLS blijft ~0).
 *
 * DEDUP: `horizonData` gaat als prop mee (geen tweede horizon-load); de drie
 * `loadDashboardData`-consumers (chart-loader, secondary-loader, page-status-
 * seed) delen dezelfde React-`cache()`-wrapper → één query-set per request.
 */
export default async function OverzichtPage() {
  const supabase = await createClient()
  // Actieve weergave (Eigen / Huishouden / Partner) uit de tf_perspective-cookie.
  const perspective = await getServerPerspective()

  // Eén auth-round-trip vooraf (React cache()): de loaders roepen intern
  // getCachedUser(supabase) aan; dit hoist die call. Met de user-id vooraf kunnen
  // de banner-seeds meteen in dezelfde parallelle blok-1-batch.
  const authUser = await getCachedUser(supabase)
  const userId = authUser?.id ?? null

  // ── BLOK 1: lichte, cache()-gedeelde loaders (geen loadDashboardData) ──
  // `getOwnProfile` is `cache()`-wrapped en wordt óók door de twee loaders
  // aangeroepen → hier "gratis" (voor de gebruikersnaam). De banner-seeds hangen
  // enkel van de user-id af.
  const [leverScoresResult, horizonData, ownProfileRes, checkinBannerSeed, welcomeGuideSeed] =
    await Promise.all([
      loadLeverScores(supabase, perspective),
      loadHorizonData(supabase, perspective),
      getOwnProfile(supabase),
      userId ? loadCheckinBannerSeed(supabase, userId) : Promise.resolve(undefined),
      userId ? loadWelcomeGuideSeed(supabase, userId) : Promise.resolve(null),
    ])

  const userName = (ownProfileRes.data as { full_name?: string | null } | null)?.full_name ?? null

  const health = horizonData?.healthScore ?? null
  const freedomPct = horizonData?.healthScoreInput?.freedomPct ?? null

  // Mini-tijdslijn-strip inputs: huidige leeftijd uit DOB + vrijheidsleeftijd.
  const dob = horizonData?.effectiveInput?.dateOfBirth ?? null
  const currentAge = dob ? Math.round(ageAtDate(dob)) : null
  const endAge = horizonData?.fireStrategy?.endAge ?? null
  const isPensioenMode = horizonData?.fireStrategy?.strategy === 'pensioen'

  // Liquide cash = niet-gekoppelde bank-accounts + cash/savings-typed assets.
  // Basis voor de CompoundInsightCard (in blok 2).
  const liquidCash =
    (horizonData?.unlinkedCash ?? 0) +
    (horizonData?.assets ?? [])
      .filter((a) => ['cash', 'savings', 'checking'].includes(a.asset_type ?? ''))
      .reduce((s, a) => s + Number(a.current_value ?? 0), 0)

  // Totaalbedragen per hefboom-tegel — uit healthScoreInput (horizonData,
  // perspectief-correct). Belasting = Box 3-druk per jaar. Cashflow = de
  // canonieke 6-maands spaarquote (`savingsRate6m`); consume-don't-recompute,
  // dezelfde grondslag als de cashflow-hefboom-status en de gezondheidsscore.
  const totals = horizonData?.healthScoreInput
    ? {
        bezittingen: horizonData.healthScoreInput.totalAssets,
        schulden: horizonData.healthScoreInput.totalDebts,
        cashflow: horizonData.healthScoreInput.savingsRate6m,
        belasting: horizonData.box3Tax ?? null,
      }
    : undefined

  // Dubbele grondslag (incl./excl. eigen woning) voor de bezittingen-/schulden-
  // hefboom en de nettovermogen-subregel. Bron = horizonData (perspectief-correct).
  const housingSplit =
    horizonData?.showDualHousingBasis
      ? {
          eigenHuisValue: horizonData.housingContext.eigenHuisValue,
          mortgageBalance: horizonData.housingContext.mortgageBalance,
        }
      : null
  const netWorthExclHome = horizonData?.netWorthExclHome ?? null

  // Netto vermogen (live) — basis voor de vrijheidstijd-hero + mini-grafiek in blok 2.
  const currentNetWorth =
    (horizonData?.healthScoreInput?.totalAssets ?? 0) -
    (horizonData?.healthScoreInput?.totalDebts ?? 0)

  // Groet + datumlabel SERVER-SIDE berekenen (Europe/Amsterdam) — één bron van
  // waarheid voor de tijd zodat SSR en de eerste client-render identiek zijn.
  const { greeting, dateLabel } = resolveOverviewGreeting()

  return (
    <>
      {/* Tab-root → 'rich' TopBar + tab-titel in de mobiele bovenbalk. */}
      <NavStackMeta title="Overzicht" topBar={{ kind: 'rich' }} bottomBar={{ kind: 'tabs' }} />
      <WelcomeGuideBanner seed={welcomeGuideSeed} />
      <CheckinBanner seed={checkinBannerSeed} />
      <OverzichtHeroPrimary
        userName={userName ?? undefined}
        greeting={greeting}
        dateLabel={dateLabel}
        health={health}
        leverScores={leverScoresResult.scores}
        totals={totals}
        housingSplit={housingSplit}
        heroChart={
          <Suspense fallback={<MiniNetWorthChartFallback />}>
            <OverzichtNetWorthChartLoader
              supabase={supabase}
              currentNetWorth={currentNetWorth}
              currentAge={currentAge}
              endAge={endAge}
              isPensioenMode={isPensioenMode}
              netWorthExclHome={netWorthExclHome}
              housingSplit={housingSplit}
            />
          </Suspense>
        }
        secondary={
          <Suspense fallback={<OverzichtSecondaryFallback />}>
            <OverzichtSecondaryLoader
              supabase={supabase}
              perspective={perspective}
              userId={userId}
              horizonData={horizonData}
              health={health}
              freedomPct={freedomPct}
              currentAge={currentAge}
              currentNetWorth={currentNetWorth}
              liquidCash={liquidCash}
            />
          </Suspense>
        }
      />
    </>
  )
}
